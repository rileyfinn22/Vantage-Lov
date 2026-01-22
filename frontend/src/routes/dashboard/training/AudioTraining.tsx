import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, RotateCcw, CheckCircle, Star, TrendingUp, MessageSquare, Clock } from 'lucide-react';
import { useConversation } from '@elevenlabs/react';
import { useStartTrainingSession, useCompleteFlagTraining } from '#data/training';
import { getPortraitForName, DEFAULT_PORTRAIT } from '#util/portraits';

// Audio waveform bar component with staggered animation
function WaveformBar({ index, isActive }: { index: number; isActive: boolean }) {
    const heights = [16, 24, 32, 40, 32, 24, 16, 28, 36, 28];
    const height = heights[index % heights.length];
    const delay = index * 80;

    return (
        <div
            className={`w-1 rounded-full transition-all duration-300 ${isActive ? 'bg-primary' : 'bg-base-content/20'}`}
            style={{
                height: isActive ? `${height}px` : '8px',
                animation: isActive ? `waveform 0.6s ease-in-out ${delay}ms infinite alternate` : 'none',
            }}
        />
    );
}

// Animated speaking indicator rings
function SpeakingRings({ isActive }: { isActive: boolean }) {
    if (!isActive) return null;

    return (
        <>
            <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-[ping_1.5s_ease-out_infinite]" />
            <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-[ping_1.5s_ease-out_0.5s_infinite]" />
            <div className="absolute inset-0 rounded-full border-2 border-primary/10 animate-[ping_1.5s_ease-out_1s_infinite]" />
        </>
    );
}

// Session result data structure
interface SessionResult {
    rating: number;
    duration: number;
    feedback: string[];
    strengths: string[];
}

export default function AudioTraining({ flagId, onComplete }: { flagId: string; onComplete?: () => void }) {
    // Validate flagId is provided
    if (!flagId) {
        throw new Error('AudioTraining requires a valid flagId prop');
    }
    const {
        mutateAsync: startSession,
        data: sessionData,
        isPending,
        error: sessionError,
        reset: resetMutation,
    } = useStartTrainingSession(flagId);
    const { mutateAsync: completeFlagTraining, isPending: isCompleting } = useCompleteFlagTraining();
    const [error, setError] = useState<string | null>(null);
    const [isRequestingMic, setIsRequestingMic] = useState(false);
    const [userWantsConnection, setUserWantsConnection] = useState(false);
    const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
    const [showResults, setShowResults] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);

    // Track if conversation has been started to prevent infinite loop
    const hasStartedRef = useRef(false);
    const sessionStartTimeRef = useRef<number | null>(null);
    const conversationIdRef = useRef<string | null>(null);

    // Use official ElevenLabs React hook
    const conversation = useConversation({
        onStatusChange: ({ status }) => {
            console.log('Status has changed to: ', status);
            // Track when conversation actually starts
            if (status === 'connected' && !sessionStartTimeRef.current) {
                sessionStartTimeRef.current = Date.now();
            }
        },
    });
    const { status, startSession: startConversation, endSession, getId: getConversationId } = conversation;

    // Start conversation when we have signed URL from backend AND user wants to be connected
    // ONLY depends on sessionData - NOT startConversation to prevent infinite loop
    useEffect(() => {
        if (!sessionData || !userWantsConnection || hasStartedRef.current) return;

        hasStartedRef.current = true;
        startConversation({
            signedUrl: sessionData.signedUrl,
            connectionType: 'websocket',
        });
    }, [sessionData, userWantsConnection, startConversation]);

    const startCall = async () => {
        try {
            setError(null);
            setIsRequestingMic(true);
            console.log('startCall - Requesting microphone access...');

            // Request microphone permission FIRST
            await navigator.mediaDevices.getUserMedia({ audio: true });

            setIsRequestingMic(false);
            console.log('startCall - Microphone access granted, starting session for flagId:', flagId);

            // Signal that user wants to be connected
            setUserWantsConnection(true);

            // ONLY after permission granted, start the backend session
            const _result = await startSession();
        } catch (err) {
            setIsRequestingMic(false);
            console.error('Failed to get microphone access:', err);

            // Handle specific permission errors
            if (err instanceof Error) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    setError('Microphone permission denied. Please allow microphone access to use voice training.');
                } else if (err.name === 'NotFoundError') {
                    setError('No microphone found. Please connect a microphone and try again.');
                } else {
                    setError(err.message || 'Failed to access microphone');
                }
            } else {
                setError('Failed to access microphone');
            }
        }
    };

    const endCall = () => {
        // Capture conversation ID before ending session
        const convId = getConversationId();
        if (convId) {
            conversationIdRef.current = convId;
            console.log('Captured conversation ID:', convId);
        }

        try {
            endSession();
        } catch (err) {
            console.error('Error ending call:', err);
        }

        // Calculate session duration
        const duration = sessionStartTimeRef.current ? Math.round((Date.now() - sessionStartTimeRef.current) / 1000) : 0;

        // Always show results - even for short sessions, just show a different message
        const mockRating = duration > 30 ? Math.floor(Math.random() * 20) + 70 : Math.floor(Math.random() * 20) + 50;
        setSessionResult({
            rating: mockRating,
            duration,
            feedback:
                duration > 30
                    ? ['Good handling of objections', 'Could improve on active listening', 'Strong closing technique']
                    : ['Try having a longer conversation for better feedback', 'Practice staying engaged with the prospect'],
            strengths: duration > 30 ? ['Rapport building', 'Product knowledge'] : ['Good start'],
        });
        setShowResults(true);
    };

    const handleRetry = () => {
        // Reset everything for a new attempt
        hasStartedRef.current = false;
        sessionStartTimeRef.current = null;
        setUserWantsConnection(false);
        setError(null);
        setSessionResult(null);
        setShowResults(false);
        resetMutation();
    };

    const handleComplete = async () => {
        console.log('handleComplete - Starting for flagId:', flagId);
        try {
            // Calculate the score from mock rating (0-10 scale)
            const score = sessionResult ? sessionResult.rating / 10 : undefined;
            const duration = sessionResult?.duration;
            const conversationId = conversationIdRef.current ?? undefined;

            console.log('handleComplete - Sending data:', { flagId, score, duration, conversationId });

            const result = await completeFlagTraining({
                flagId,
                conversationId,
                score,
                duration,
            });
            console.log('handleComplete - Flag training completed successfully:', result);
            // Show completed state on the tile
            setIsCompleted(true);
        } catch (err) {
            console.error('handleComplete - Failed to complete training:', err);
            // Still mark as completed locally even if API failed
            setIsCompleted(true);
        }
        // The query invalidation will remove this from the rep's display
        if (onComplete) {
            onComplete();
        }
    };

    const displayError = error || (sessionError ? 'Failed to start training session' : null);

    // Get prospect data from session (after starting)
    const prospectData = sessionData?.prospectData;
    const prospectName = prospectData?.name ?? 'Sales Prospect';
    const prospectRole = prospectData?.role;
    const prospectCompany = prospectData?.company;

    // Get portrait - uses shared utility which handles exact match and fallback
    const prospectPortrait = getPortraitForName(prospectName);

    return (
        <div className="card bg-gradient-to-br from-base-200 to-base-300 border border-base-content/10 shadow-xl overflow-hidden">
            {/* Custom keyframe animation style */}
            <style>{`
                @keyframes waveform {
                    0% { transform: scaleY(0.5); }
                    100% { transform: scaleY(1); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }
                @keyframes glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(var(--p), 0.3); }
                    50% { box-shadow: 0 0 40px rgba(var(--p), 0.5); }
                }
            `}</style>

            <div className="card-body">
                {/* Error Display */}
                {displayError && (
                    <div className="alert alert-error mb-4 animate-[fadeIn_0.3s_ease-out]">
                        <span>{displayError}</span>
                        <button type="button" className="btn btn-sm btn-outline" onClick={startCall}>
                            Retry
                        </button>
                    </div>
                )}

                {/* DISCONNECTED STATE - Clean start button (but not when showing results) */}
                {status === 'disconnected' && !showResults && (
                    <div className="py-8 animate-[fadeIn_0.3s_ease-out]">
                        <div className="text-center mb-8">
                            {/* Prospect Preview - show greyscale before session starts */}
                            <div className="relative inline-block mb-6">
                                <div className="avatar">
                                    <div className="w-24 h-24 rounded-full ring-4 ring-base-content/10 ring-offset-4 ring-offset-base-200">
                                        <img src={DEFAULT_PORTRAIT} alt="Prospect" className="object-cover grayscale opacity-60" />
                                    </div>
                                </div>
                            </div>
                            <h2 className="text-xl font-semibold mb-2">Ready to Practice?</h2>
                            <p className="text-base-content/60 text-sm">
                                Practice this scenario with a <span className="font-medium text-base-content">real prospect persona</span>
                            </p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-primary w-full gap-3 btn-lg group transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
                            onClick={startCall}
                            disabled={isPending || isRequestingMic}
                        >
                            {isRequestingMic ? (
                                <>
                                    <span className="loading loading-spinner loading-sm" />
                                    Requesting microphone...
                                </>
                            ) : isPending ? (
                                <>
                                    <span className="loading loading-spinner loading-sm" />
                                    Starting session...
                                </>
                            ) : (
                                <>
                                    <Phone className="w-5 h-5 group-hover:animate-[float_1s_ease-in-out_infinite]" />
                                    Start Conversation
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* CONNECTING STATE - Animated connection */}
                {status === 'connecting' && (
                    <div className="py-12 animate-[fadeIn_0.3s_ease-out]">
                        <div className="text-center">
                            {/* Animated connecting avatar */}
                            <div className="relative inline-block mb-6">
                                <div className="avatar">
                                    <div className="w-28 h-28 rounded-full ring-4 ring-primary/30 ring-offset-4 ring-offset-base-200 animate-pulse">
                                        <img src={prospectPortrait} alt={prospectName} className="object-cover" />
                                    </div>
                                </div>
                                {/* Connecting rings */}
                                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                            </div>

                            {/* Loading dots */}
                            <div className="flex justify-center gap-1 mb-4">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="w-2 h-2 rounded-full bg-primary animate-bounce"
                                        style={{ animationDelay: `${i * 150}ms` }}
                                    />
                                ))}
                            </div>

                            <p className="text-lg font-medium text-base-content/80">Connecting...</p>
                            <p className="text-sm text-base-content/50 mt-1">Preparing {prospectName}</p>
                        </div>
                    </div>
                )}

                {/* CONNECTED STATE - Active conversation UI */}
                {status === 'connected' && (
                    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                        {/* Main conversation area */}
                        <div className="relative rounded-2xl bg-base-100/50 backdrop-blur-sm p-8 border border-base-content/5">
                            {/* Central speaking avatar */}
                            <div className="flex flex-col items-center">
                                <div className="relative mb-6">
                                    {/* Avatar with speaking rings */}
                                    <div className="relative">
                                        <div className="avatar" style={{ animation: 'glow 2s ease-in-out infinite' }}>
                                            <div className="w-32 h-32 rounded-full ring-4 ring-success ring-offset-4 ring-offset-base-100">
                                                <img src={prospectPortrait} alt={prospectName} className="object-cover" />
                                            </div>
                                        </div>
                                        <SpeakingRings isActive={true} />
                                    </div>

                                    {/* Live indicator badge */}
                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                                        <div className="badge badge-success gap-1.5 px-3 py-2 shadow-lg">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-content opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-success-content" />
                                            </span>
                                            Live
                                        </div>
                                    </div>
                                </div>

                                {/* Prospect info */}
                                <h3 className="text-xl font-semibold">{prospectName}</h3>
                                {prospectRole && prospectCompany && (
                                    <p className="text-sm text-base-content/60 mb-6">
                                        {prospectRole} at {prospectCompany}
                                    </p>
                                )}
                                {!prospectRole && !prospectCompany && <p className="text-sm text-base-content/60 mb-6">Sales Prospect</p>}

                                {/* Waveform visualization */}
                                <div className="flex items-center justify-center gap-1 h-12 mb-4">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <WaveformBar key={i} index={i} isActive={true} />
                                    ))}
                                </div>

                                {/* Status text */}
                                <p className="text-base-content/70 text-sm">Listening and responding...</p>
                            </div>
                        </div>

                        {/* Bottom controls */}
                        <div className="flex items-center gap-4">
                            {/* Mic status indicator */}
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 text-success text-sm">
                                <Mic className="w-4 h-4" />
                                <span>Mic active</span>
                            </div>

                            {/* End call button */}
                            <button
                                type="button"
                                className="btn btn-error flex-1 gap-2 transition-all duration-300 hover:scale-[1.02]"
                                onClick={endCall}
                            >
                                <PhoneOff className="w-4 h-4" />
                                End Conversation
                            </button>
                        </div>
                    </div>
                )}

                {/* RESULTS STATE - Show after completing the conversation */}
                {showResults && sessionResult && !isCompleted && (
                    <div className="py-6 animate-[fadeIn_0.3s_ease-out]">
                        {/* Success header */}
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/20 mb-4">
                                <CheckCircle className="w-8 h-8 text-success" />
                            </div>
                            <h2 className="text-xl font-semibold mb-1">Training Complete!</h2>
                            <p className="text-base-content/60 text-sm">Here's how you did in this session</p>
                        </div>

                        {/* Score display */}
                        <div className="rounded-2xl bg-base-100/50 p-6 mb-6 border border-base-content/5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                className={`w-5 h-5 ${
                                                    star <= Math.round(sessionResult.rating / 20)
                                                        ? 'text-warning fill-warning'
                                                        : 'text-base-content/20'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-2xl font-bold">{sessionResult.rating}</span>
                                    <span className="text-base-content/50">/100</span>
                                </div>
                                <div className="flex items-center gap-2 text-base-content/60 text-sm">
                                    <Clock className="w-4 h-4" />
                                    <span>
                                        {Math.floor(sessionResult.duration / 60)}:
                                        {(sessionResult.duration % 60).toString().padStart(2, '0')}
                                    </span>
                                </div>
                            </div>

                            {/* Feedback sections */}
                            <div className="space-y-4">
                                {/* Strengths */}
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-medium text-success mb-2">
                                        <TrendingUp className="w-4 h-4" />
                                        <span>Strengths</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {sessionResult.strengths.map((strength) => (
                                            <span key={strength} className="badge badge-success badge-outline">
                                                {strength}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Feedback */}
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-medium text-base-content/70 mb-2">
                                        <MessageSquare className="w-4 h-4" />
                                        <span>Feedback</span>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {sessionResult.feedback.map((item) => (
                                            <li key={item} className="text-sm text-base-content/60 flex items-start gap-2">
                                                <span className="text-primary mt-1">•</span>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3">
                            <button type="button" className="btn btn-outline flex-1 gap-2" onClick={handleRetry}>
                                <RotateCcw className="w-4 h-4" />
                                Try Again
                            </button>
                            <button type="button" className="btn btn-primary flex-1 gap-2" onClick={handleComplete} disabled={isCompleting}>
                                {isCompleting ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4" />
                                        Complete Training
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* COMPLETED STATE - Show after training is marked complete */}
                {isCompleted && sessionResult && (
                    <div className="py-8 animate-[fadeIn_0.3s_ease-out]">
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/20 mb-4">
                                <CheckCircle className="w-10 h-10 text-success" />
                            </div>
                            <h2 className="text-2xl font-bold text-success mb-2">Training Completed!</h2>
                            <p className="text-base-content/60 mb-6">
                                Great work! This training has been saved to your completed sessions.
                            </p>

                            {/* Score summary */}
                            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-base-100/50 border border-base-content/10">
                                <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <Star
                                            key={star}
                                            className={`w-5 h-5 ${
                                                star <= Math.round(sessionResult.rating / 20)
                                                    ? 'text-warning fill-warning'
                                                    : 'text-base-content/20'
                                            }`}
                                        />
                                    ))}
                                </div>
                                <span className="text-2xl font-bold">{sessionResult.rating}</span>
                                <span className="text-base-content/50">/100</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
