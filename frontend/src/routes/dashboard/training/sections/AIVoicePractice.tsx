import { Suspense, lazy, useState, useRef } from 'react';
import { tw } from '#util/tw';
import { Play, Pause, CheckCircle, Star, Clock, Volume2 } from 'lucide-react';

const ClientLiveTraining = lazy(() => import('../ClientLiveTraining'));

const SectionHeader = tw.h2`text-lg font-semibold flex items-center gap-2`;
const PracticeSection = tw.div`bg-base-200/50 rounded-lg p-8 text-center space-y-4`;

interface TrainingSession {
    conversationId?: string;
    score?: number;
    duration?: number;
    completedAt?: string;
}

interface AIVoicePracticeProps {
    flagId: string;
    isCompleted?: boolean;
    trainingSession?: TrainingSession | null;
}

export function AIVoicePractice({ flagId, isCompleted, trainingSession }: AIVoicePracticeProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioError, setAudioError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Format duration as mm:ss
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const togglePlayback = () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch((err) => {
                console.error('Error playing audio:', err);
                setAudioError('Failed to play recording');
            });
        }
        setIsPlaying(!isPlaying);
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
    };

    const handleAudioError = () => {
        setAudioError('Recording not available');
        setIsPlaying(false);
    };

    // If the training is already completed, show the completed state
    if (isCompleted) {
        const score = trainingSession?.score ?? 0;
        const scoreOutOf100 = score * 10;
        const audioUrl = trainingSession?.conversationId
            ? `/vantage/api/training/conversation/${trainingSession.conversationId}/audio`
            : null;

        return (
            <>
                <SectionHeader>
                    <CheckCircle className="w-5 h-5 text-success" />
                    Training Completed
                </SectionHeader>
                <div className="bg-success/10 rounded-lg p-8 text-center space-y-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/20 mb-2">
                        <CheckCircle className="w-8 h-8 text-success" />
                    </div>
                    <h3 className="text-xl font-semibold text-success">Great Job!</h3>
                    <p className="text-base-content/70">
                        You've completed this training session.
                        {trainingSession?.completedAt && (
                            <span className="block text-sm mt-1">
                                Completed on {new Date(trainingSession.completedAt).toLocaleDateString()}
                            </span>
                        )}
                    </p>

                    {/* Score and Duration - only show if we have session data */}
                    {trainingSession && (trainingSession.score != null || trainingSession.duration != null) && (
                        <div className="flex items-center justify-center gap-8">
                            {trainingSession.score != null && (
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-1 mb-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                className={`w-5 h-5 ${
                                                    star <= Math.round(scoreOutOf100 / 20)
                                                        ? 'text-warning fill-warning'
                                                        : 'text-base-content/20'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-2xl font-bold">{scoreOutOf100}</span>
                                    <span className="text-sm text-base-content/60">/100</span>
                                </div>
                            )}
                            {trainingSession.duration != null && (
                                <div className="flex flex-col items-center">
                                    <Clock className="w-5 h-5 text-base-content/60 mb-1" />
                                    <span className="text-xl font-semibold">{formatDuration(trainingSession.duration)}</span>
                                    <span className="text-sm text-base-content/60">Duration</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Audio Recording Playback */}
                    {audioUrl && (
                        <div className="mt-6 pt-6 border-t border-base-content/10">
                            <h4 className="text-sm font-medium text-base-content/70 mb-3 flex items-center justify-center gap-2">
                                <Volume2 className="w-4 h-4" />
                                Practice Recording
                            </h4>
                            {audioError ? (
                                <p className="text-sm text-error">{audioError}</p>
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <audio
                                        ref={audioRef}
                                        src={audioUrl}
                                        onEnded={handleAudioEnded}
                                        onError={handleAudioError}
                                        preload="metadata"
                                    />
                                    <button type="button" onClick={togglePlayback} className="btn btn-circle btn-primary btn-lg">
                                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                                    </button>
                                    <span className="text-sm text-base-content/60">
                                        {isPlaying ? 'Playing...' : 'Listen to your practice session'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </>
        );
    }

    return (
        <>
            <SectionHeader>
                <Play className="w-5 h-5" />
                AI Voice Practice Session
            </SectionHeader>
            <PracticeSection>
                <Suspense
                    fallback={
                        <div className="flex justify-center items-center p-8">
                            <span className="loading loading-spinner loading-md mr-2"></span>
                            <span>Loading voice training...</span>
                        </div>
                    }
                >
                    <ClientLiveTraining flagId={flagId} />
                </Suspense>
            </PracticeSection>
        </>
    );
}
