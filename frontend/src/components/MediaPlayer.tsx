import { useState, useRef, useEffect } from 'react';
import { formatAudioTime, parseAudioTimestamp } from '#util';
import { useAudioDownloadUrl } from '#data/fetchers';
import { Play, Pause, SkipBack, SkipForward, Volume2, Flag, Minus, Plus, Target } from 'lucide-react';
import { debounce } from 'es-toolkit';

interface FlagMarker {
    id: number;
    timestamp: string | number | null;
    title?: string;
}

interface MediaPlayerProps {
    fileId: number | null | undefined;
    mimeType?: string | null;
    startTimestamp?: string | number | null;
    /** Compact mode for inline display */
    compact?: boolean;
    /** Auto-play when loaded */
    autoPlay?: boolean;
    /** Flag markers to display on the timeline */
    flags?: FlagMarker[];
    /** Callback when a flag marker is clicked */
    onFlagClick?: (flagId: number) => void;
}

/**
 * useMediaPlayer Hook
 */
function useMediaPlayer(mediaUrl: string | null, isVideo: boolean, startTime: number = 0, refetchUrl?: () => Promise<unknown>) {
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasSeekedToStart = useRef(false);
    const lastRetryTimestamp = useRef<number>(0);
    const hasRetriedRecently = useRef(false);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!mediaUrl) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        hasSeekedToStart.current = false;
    }, [mediaUrl]);

    const bindMediaElement = (element: HTMLVideoElement | HTMLAudioElement | null) => {
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }

        mediaRef.current = element;
        if (!element || !mediaUrl) return;

        const handleLoadedMetadata = () => {
            setDuration(element.duration);
            setIsLoading(false);
            if (startTime > 0 && !hasSeekedToStart.current) {
                element.currentTime = Math.min(startTime, element.duration);
                hasSeekedToStart.current = true;
            }
        };

        const handleCanPlay = () => {
            if (element.duration && element.duration > 0) {
                setDuration(element.duration);
                setIsLoading(false);
            }
        };

        const handleTimeUpdate = () => setCurrentTime(element.currentTime);
        const handleEnded = () => setIsPlaying(false);
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        const handleError = debounce(async () => {
            const now = Date.now();
            const timeSinceLastRetry = now - lastRetryTimestamp.current;
            const shouldRetry = refetchUrl && (!hasRetriedRecently.current || timeSinceLastRetry > 10000);

            if (shouldRetry) {
                lastRetryTimestamp.current = now;
                hasRetriedRecently.current = true;
                try {
                    await refetchUrl();
                } catch {
                    setError(`Failed to load ${isVideo ? 'video' : 'audio'} file`);
                    setIsLoading(false);
                }
            } else {
                setError(`Failed to load ${isVideo ? 'video' : 'audio'} file`);
                setIsLoading(false);
            }
        }, 500);

        if (element.readyState >= 1) handleLoadedMetadata();

        element.addEventListener('loadedmetadata', handleLoadedMetadata);
        element.addEventListener('canplay', handleCanPlay);
        element.addEventListener('timeupdate', handleTimeUpdate);
        element.addEventListener('ended', handleEnded);
        element.addEventListener('play', handlePlay);
        element.addEventListener('pause', handlePause);
        element.addEventListener('error', handleError);

        cleanupRef.current = () => {
            element.removeEventListener('loadedmetadata', handleLoadedMetadata);
            element.removeEventListener('canplay', handleCanPlay);
            element.removeEventListener('timeupdate', handleTimeUpdate);
            element.removeEventListener('ended', handleEnded);
            element.removeEventListener('play', handlePlay);
            element.removeEventListener('pause', handlePause);
            element.removeEventListener('error', handleError);
            handleError.cancel();
        };
    };

    const play = () => mediaRef.current?.play();
    const pause = () => mediaRef.current?.pause();
    const togglePlayPause = () => (isPlaying ? pause() : play());

    const seekTo = (time: number) => {
        if (mediaRef.current) {
            const actualDuration = mediaRef.current.duration || duration;
            mediaRef.current.currentTime = Math.max(0, Math.min(time, actualDuration));
        }
    };

    return {
        mediaRef,
        bindMediaElement,
        isPlaying,
        currentTime,
        duration,
        isLoading,
        error,
        play,
        pause,
        togglePlayPause,
        seekTo,
    };
}

/**
 * Professional MediaPlayer Component
 */
export function MediaPlayer({
    fileId,
    mimeType,
    startTimestamp = 0,
    compact = false,
    autoPlay = false,
    flags = [],
    onFlagClick,
}: MediaPlayerProps) {
    const [shouldLoadMedia, setShouldLoadMedia] = useState(autoPlay);
    const [hoveredFlag, setHoveredFlag] = useState<number | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    const isVideo = mimeType?.startsWith('video/') ?? false;
    const { data: mediaUrl, isLoading: urlLoading, refetch: refetchMediaUrl } = useAudioDownloadUrl(fileId, shouldLoadMedia, mimeType);

    useEffect(() => {
        if (mediaUrl?.startsWith('blob:')) {
            blobUrlRef.current = mediaUrl;
        }
    }, [mediaUrl]);

    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
        };
    }, []);

    const startTimeInSeconds = parseAudioTimestamp(startTimestamp);
    // Seek 20 seconds before the flagged moment to provide context
    const FLAG_SEEK_OFFSET = 20;
    const startSeekTime = Math.max(0, startTimeInSeconds - FLAG_SEEK_OFFSET);
    const player = useMediaPlayer(mediaUrl ?? null, isVideo, startSeekTime, refetchMediaUrl);

    const handlePlay = () => {
        if (!shouldLoadMedia) {
            setShouldLoadMedia(true);
        } else {
            player.togglePlayPause();
        }
    };

    // No media file
    if (!fileId) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-base-content/40">
                <Volume2 className="w-10 h-10 mb-2" strokeWidth={1.5} />
                <p className="text-sm font-medium">No recording available</p>
            </div>
        );
    }

    // Loading state
    if (urlLoading && shouldLoadMedia) {
        return (
            <div className="bg-base-200 rounded-xl p-6">
                <div className="flex flex-col items-center gap-3">
                    <span className="loading loading-spinner loading-md text-primary" />
                    <div className="text-sm text-base-content/60">Loading {isVideo ? 'video' : 'audio'}...</div>
                </div>
            </div>
        );
    }

    const isLoadingMedia = urlLoading || player.isLoading;

    // Error state
    if (player.error) {
        return (
            <div className="bg-error/10 border border-error/20 rounded-xl p-4">
                <p className="text-error text-sm text-center">{player.error}</p>
            </div>
        );
    }

    const hasMediaReady = mediaUrl && !isLoadingMedia;
    const progressPercent = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;

    // Calculate flag positions
    // FLAG_SEEK_OFFSET is defined above (20 seconds before the flag to start playback)
    const flagPositions = flags
        .map((flag) => {
            const flagTime = parseAudioTimestamp(flag.timestamp);
            return {
                id: flag.id,
                title: flag.title,
                position: player.duration > 0 ? (flagTime / player.duration) * 100 : 0,
                time: flagTime,
                seekTime: Math.max(0, flagTime - FLAG_SEEK_OFFSET), // Seek 20 seconds before the actual flag
            };
        })
        .filter((f) => f.position >= 0 && f.position <= 100);

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!hasMediaReady) return;
        player.seekTo(Number(e.target.value));
    };

    // Video player
    if (isVideo && mediaUrl) {
        return (
            <div className="space-y-4">
                <div
                    className="relative rounded-xl overflow-hidden bg-black shadow-lg cursor-pointer"
                    onClick={player.togglePlayPause}
                >
                    <video ref={(el) => player.bindMediaElement(el)} className="w-full" src={mediaUrl} preload="metadata">
                        <track kind="captions" />
                    </video>
                    {/* Play/Pause overlay */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${player.isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                        <div className="bg-black/50 rounded-full p-3">
                            {player.isPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white ml-0.5" />}
                        </div>
                    </div>
                </div>

                {/* Timeline with flags */}
                <div className="bg-base-200 rounded-xl p-4 space-y-3">
                    <div className="relative">
                        {/* Track */}
                        <div className="relative h-2 bg-base-300 rounded-full overflow-hidden">
                            <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-75"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {/* Slider */}
                        <input
                            type="range"
                            min={0}
                            max={player.duration || 100}
                            step={0.1}
                            value={player.currentTime}
                            onChange={handleSliderChange}
                            disabled={!hasMediaReady}
                            className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
                            aria-label="Seek"
                        />

                        {/* Flag markers */}
                        {flagPositions.map((flag) => (
                            <div
                                key={flag.id}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                                style={{ left: `${flag.position}%` }}
                            >
                                <button
                                    type="button"
                                    className="group relative"
                                    onClick={() => hasMediaReady && player.seekTo(flag.seekTime)}
                                    onMouseEnter={() => setHoveredFlag(flag.id)}
                                    onMouseLeave={() => setHoveredFlag(null)}
                                >
                                    <div
                                        className={`w-3 h-3 rounded-full bg-warning border-2 border-base-100 shadow-sm transition-transform ${hoveredFlag === flag.id ? 'scale-150' : ''}`}
                                    />
                                    {hoveredFlag === flag.id && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral text-neutral-content text-xs rounded-lg whitespace-nowrap shadow-lg">
                                            <span className="font-mono">{formatAudioTime(flag.time)}</span>
                                            {flag.title && <span className="ml-1 opacity-70">· {flag.title}</span>}
                                        </div>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Time display */}
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-base-content/70">{formatAudioTime(player.currentTime)}</span>
                        <span className="font-mono text-base-content/50">{formatAudioTime(player.duration)}</span>
                    </div>
                </div>

                {/* Controls */}
                {startTimeInSeconds > 0 && (
                    <div className="flex justify-center">
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost gap-2"
                            onClick={() => player.seekTo(startSeekTime)}
                            disabled={!hasMediaReady}
                        >
                            <Target className="w-4 h-4" />
                            Jump to {formatAudioTime(startTimeInSeconds)}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Audio player
    return (
        <div className="space-y-1">
            {/* Main player card */}
            <div className={`bg-base-200 rounded-xl ${compact ? 'p-3' : 'p-5'}`}>
                {/* Controls row */}
                <div className="flex items-center gap-4">
                    {/* Skip back */}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-base-content"
                        onClick={() => player.seekTo(player.currentTime - 10)}
                        disabled={!hasMediaReady}
                        title="Back 10s"
                    >
                        <SkipBack className="w-4 h-4" />
                    </button>

                    {/* Play/Pause button */}
                    <button
                        type="button"
                        onClick={handlePlay}
                        className={`btn btn-circle ${compact ? 'btn-md' : 'btn-lg'} ${
                            player.isPlaying ? 'btn-primary shadow-lg shadow-primary/25' : 'btn-primary btn-outline hover:btn-primary'
                        } transition-all duration-200`}
                    >
                        {player.isPlaying ? (
                            <Pause className={compact ? 'w-5 h-5' : 'w-6 h-6'} />
                        ) : (
                            <Play className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} ml-0.5`} />
                        )}
                    </button>

                    {/* Skip forward */}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-base-content"
                        onClick={() => player.seekTo(player.currentTime + 10)}
                        disabled={!hasMediaReady}
                        title="Forward 10s"
                    >
                        <SkipForward className="w-4 h-4" />
                    </button>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Time display */}
                    <div className="text-right">
                        <div className="font-mono text-lg font-semibold tracking-tight text-base-content">
                            {formatAudioTime(player.currentTime)}
                        </div>
                        <div className="font-mono text-xs text-base-content/50">/ {formatAudioTime(player.duration)}</div>
                    </div>
                </div>

                {/* Progress bar section */}
                <div className="mt-4 space-y-2">
                    {/* Timeline track */}
                    <div className="relative group">
                        {/* Background track */}
                        <div className="h-1.5 bg-base-300 rounded-full overflow-hidden group-hover:h-2 transition-all duration-150">
                            {/* Progress fill */}
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-75"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {/* Invisible slider for precise control */}
                        <input
                            type="range"
                            min={0}
                            max={player.duration || 100}
                            step={0.1}
                            value={player.currentTime}
                            onChange={handleSliderChange}
                            disabled={!hasMediaReady}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            aria-label="Seek"
                        />

                        {/* Thumb indicator */}
                        {hasMediaReady && (
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                style={{ left: `calc(${progressPercent}% - 6px)` }}
                            />
                        )}

                        {/* Flag markers */}
                        {flagPositions.map((flag) => (
                            <div
                                key={flag.id}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                                style={{ left: `${flag.position}%` }}
                            >
                                <button
                                    type="button"
                                    className="group/flag relative"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (hasMediaReady) player.seekTo(flag.seekTime);
                                    }}
                                    onMouseEnter={() => setHoveredFlag(flag.id)}
                                    onMouseLeave={() => setHoveredFlag(null)}
                                >
                                    <Flag
                                        className={`w-4 h-4 text-warning fill-warning drop-shadow transition-transform ${
                                            hoveredFlag === flag.id ? 'scale-125' : ''
                                        }`}
                                    />
                                    {/* Tooltip */}
                                    {hoveredFlag === flag.id && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
                                            <div className="bg-neutral text-neutral-content text-xs rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap">
                                                <div className="font-mono font-medium">{formatAudioTime(flag.time)}</div>
                                                {flag.title && (
                                                    <div className="text-neutral-content/70 max-w-[200px] truncate mt-0.5">
                                                        {flag.title}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral" />
                                        </div>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Fine controls and info row */}
                    <div className="flex items-center justify-between">
                        {/* Flag count */}
                        {flagPositions.length > 0 ? (
                            <div className="flex items-center gap-1.5 text-xs text-base-content/50">
                                <Flag className="w-3 h-3 text-warning fill-warning" />
                                <span>
                                    {flagPositions.length} flag{flagPositions.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                        ) : (
                            <div />
                        )}

                        {/* Fine seek controls */}
                        {hasMediaReady && (
                            <div className="flex items-center gap-1 bg-base-300/50 rounded-lg px-1 py-0.5">
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-xs gap-0.5 h-6 min-h-0 px-1.5"
                                    onClick={() => player.seekTo(player.currentTime - 1)}
                                    title="Back 1s"
                                >
                                    <Minus className="w-3 h-3" />
                                    <span className="text-xs">1s</span>
                                </button>
                                <div className="w-px h-4 bg-base-content/10" />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-xs gap-0.5 h-6 min-h-0 px-1.5"
                                    onClick={() => player.seekTo(player.currentTime + 1)}
                                    title="Forward 1s"
                                >
                                    <span className="text-xs">1s</span>
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Jump to timestamp button */}
            {!compact && startTimeInSeconds > 0 && (
                <div className="flex justify-center pt-2">
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost gap-2 text-primary hover:bg-primary/10"
                        onClick={() => player.seekTo(startSeekTime)}
                        disabled={!hasMediaReady}
                    >
                        <Target className="w-4 h-4" />
                        <span>Jump to flagged moment</span>
                        <span className="font-mono text-xs bg-primary/10 px-1.5 py-0.5 rounded">{formatAudioTime(startTimeInSeconds)}</span>
                    </button>
                </div>
            )}

            {/* Hidden audio element */}
            {mediaUrl && !isVideo && (
                <audio ref={(el) => player.bindMediaElement(el)} src={mediaUrl} preload="auto" style={{ display: 'none' }}>
                    <track kind="captions" />
                </audio>
            )}
        </div>
    );
}

export default MediaPlayer;
export type { FlagMarker };
