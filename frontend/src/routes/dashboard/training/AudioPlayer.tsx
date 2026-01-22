import { useState } from 'react';
import { tw } from '#util/tw';
import { formatAudioTime, parseAudioTimestamp } from '#util';
import { useAudioDownloadUrl } from '#data/fetchers';
import { useAudioPlayer } from '#data/useAudioPlayer';
import { Play, Pause, RotateCcw } from 'lucide-react';

// Styled components
const AudioPlayerWrapper = tw.div`bg-base-200/50 rounded-lg p-6 text-center`;
const PlayButton = tw.div`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 cursor-pointer transition-all duration-200`;
const AudioControls = tw.div`flex gap-2 justify-center flex-wrap`;

interface AudioPlayerProps {
    audioFileId: number | null | undefined;
    startTimestamp?: string | number | null;
}

/**
 * AudioPlayer Component
 *
 * Self-contained audio player that handles:
 * - Lazy fetching of presigned audio URL (only on first play)
 * - Audio playback with auto-seek to start time
 * - Play/pause controls and progress bar
 * - Loading and error states
 */
export function AudioPlayer({ audioFileId, startTimestamp = 0 }: AudioPlayerProps) {
    // Control when to start fetching the audio URL (lazy loading)
    const [shouldLoadAudio, setShouldLoadAudio] = useState(false);

    // Fetch audio download URL - only enabled when user clicks play
    const { data: audioUrl, isLoading: audioLoading, refetch: refetchAudioUrl } = useAudioDownloadUrl(audioFileId, shouldLoadAudio);

    // Parse start timestamp from flag data
    const startTimeInSeconds = parseAudioTimestamp(startTimestamp);

    // Initialize audio player with auto-seek to start time and smart URL refetch
    const audioPlayer = useAudioPlayer(audioUrl ?? null, startTimeInSeconds, refetchAudioUrl);

    // Handle initial play - triggers URL fetch on first click
    const handleInitialPlay = () => {
        if (!shouldLoadAudio) {
            setShouldLoadAudio(true);
        } else {
            audioPlayer.togglePlayPause();
        }
    };

    // No audio file
    if (!audioFileId) {
        return (
            <div className="text-center text-base-content/60 py-8">
                <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No audio recording available</p>
            </div>
        );
    }

    // Loading state - show when URL is being fetched or audio is loading
    const isLoadingAudio = audioLoading || audioPlayer.isLoading;

    if (isLoadingAudio && shouldLoadAudio) {
        return (
            <AudioPlayerWrapper>
                <div className="flex flex-col items-center gap-2">
                    <span className="loading loading-spinner loading-md"></span>
                    <div className="text-sm text-base-content/60">Loading audio...</div>
                </div>
            </AudioPlayerWrapper>
        );
    }

    // Error state
    if (audioPlayer.error) {
        return (
            <AudioPlayerWrapper>
                <div className="alert alert-error">
                    <span>{audioPlayer.error}</span>
                </div>
            </AudioPlayerWrapper>
        );
    }

    // Ready to play (or waiting for initial play click)
    const hasAudioReady = audioUrl && !isLoadingAudio;

    return (
        <>
            <AudioPlayerWrapper>
                <PlayButton
                    onClick={handleInitialPlay}
                    className={
                        audioPlayer.isPlaying
                            ? 'bg-primary text-primary-content hover:scale-110'
                            : 'bg-primary/20 text-primary hover:bg-primary/30'
                    }
                >
                    {audioPlayer.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </PlayButton>
                <div className="text-sm text-base-content/60">
                    {hasAudioReady
                        ? `${formatAudioTime(audioPlayer.currentTime)} / ${formatAudioTime(audioPlayer.duration)}`
                        : 'Ready to play'}
                </div>
            </AudioPlayerWrapper>

            {/* Progress bar */}
            <div className="w-full">
                <input
                    type="range"
                    min="0"
                    max={audioPlayer.duration || 0}
                    value={audioPlayer.currentTime}
                    onChange={(e) => audioPlayer.seekTo(Number(e.target.value))}
                    className="range range-primary range-xs w-full"
                    disabled={!hasAudioReady}
                />
            </div>

            {/* Playback controls */}
            <AudioControls>
                <button className="btn btn-outline btn-sm gap-1" onClick={handleInitialPlay}>
                    {audioPlayer.isPlaying ? (
                        <>
                            <Pause className="w-4 h-4" />
                            Pause
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Play
                        </>
                    )}
                </button>
                <button className="btn btn-outline btn-sm gap-1" onClick={() => audioPlayer.rewind(10)} disabled={!hasAudioReady}>
                    <RotateCcw className="w-4 h-4" />
                    Replay 10s
                </button>
            </AudioControls>
        </>
    );
}
