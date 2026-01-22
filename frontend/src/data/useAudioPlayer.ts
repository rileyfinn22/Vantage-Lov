import { useRef, useState, useEffect } from 'react';
import { debounce } from 'es-toolkit';

/**
 * Basic HTML5 audio player hook with auto-seek to start time
 *
 * Provides simple controls for playing audio files:
 * - Play/pause toggle
 * - Seek to specific time
 * - Rewind by seconds
 * - Track current time and duration
 * - Auto-seek to startTime when audio loads
 * - Smart presigned URL refetch on error (retries once within 10s window)
 */
export function useAudioPlayer(audioUrl: string | null, startTime: number = 0, refetchUrl?: () => Promise<unknown>) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasSeekedToStart = useRef(false);
    const lastRetryTimestamp = useRef<number>(0);
    const hasRetriedRecently = useRef(false);

    // Initialize audio element
    // biome-ignore lint/correctness/useExhaustiveDependencies: refetchUrl causes infinite loop - see note at end of effect
    useEffect(() => {
        if (!audioUrl) {
            setIsLoading(false);
            return;
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setIsLoading(true);
        setError(null);
        hasSeekedToStart.current = false;

        // Event handlers
        const handleLoadedMetadata = () => {
            setDuration(audio.duration);
            setIsLoading(false);

            // Auto-seek to start time when audio loads
            if (startTime > 0 && !hasSeekedToStart.current) {
                audio.currentTime = Math.min(startTime, audio.duration);
                hasSeekedToStart.current = true;
            }
        };

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const handleEnded = () => {
            setIsPlaying(false);
        };

        // Smart error handler with debouncing and URL refetch
        const handleError = debounce(async () => {
            const now = Date.now();
            const timeSinceLastRetry = now - lastRetryTimestamp.current;
            const shouldRetry = refetchUrl && (!hasRetriedRecently.current || timeSinceLastRetry > 10000);

            if (shouldRetry) {
                // Try refetching the presigned URL once
                lastRetryTimestamp.current = now;
                hasRetriedRecently.current = true;

                try {
                    await refetchUrl();
                    // The URL refetch will trigger a new useEffect cycle with updated audioUrl
                    // so we don't need to do anything else here
                } catch (_refetchError) {
                    // Refetch itself failed, show error
                    setError('Failed to load audio file');
                    setIsLoading(false);
                }
            } else {
                // Either no refetch function provided, or we already retried recently
                setError('Failed to load audio file');
                setIsLoading(false);
            }
        }, 500); // Debounce by 500ms to prevent rapid retry loops

        // Attach listeners
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);

        // Cleanup
        return () => {
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('error', handleError);
            handleError.cancel(); // Cancel any pending debounced error handler
            audio.pause();
            audioRef.current = null;
        };
        // Note: refetchUrl is intentionally NOT in dependencies to prevent re-creating Audio element
        // when the refetch function changes (React Query recreates it on every render).
        // It's only used in the error handler, not for initialization.
    }, [audioUrl, startTime]);

    // Play audio
    const play = () => {
        if (audioRef.current) {
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    // Pause audio
    const pause = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    };

    // Toggle play/pause
    const togglePlayPause = () => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    };

    // Seek to specific time
    const seekTo = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
        }
    };

    // Rewind by specified seconds
    const rewind = (seconds: number = 10) => {
        if (audioRef.current) {
            seekTo(currentTime - seconds);
        }
    };

    return {
        audioRef,
        isPlaying,
        currentTime,
        duration,
        isLoading,
        error,
        play,
        pause,
        togglePlayPause,
        seekTo,
        rewind,
    };
}
