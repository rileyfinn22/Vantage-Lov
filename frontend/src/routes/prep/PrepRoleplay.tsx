import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, RotateCcw, CheckCircle, Star, TrendingUp, MessageSquare, Clock, X } from 'lucide-react';
import { useConversation } from '@elevenlabs/react';
import { useCompletePrepRoleplay } from '#data/meetingPrep';
import { getPortraitForName } from '#util/portraits';

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

interface PrepRoleplayProps {
    prepId: number;
    signedUrl: string;
    prospectName: string;
    prospectRole?: string | null;
    prospectCompany: string;
    onClose: () => void;
    onComplete: () => void;
}

/**
 * PrepRoleplay Component
 *
 * ElevenLabs voice conversation interface for meeting prep roleplay practice.
 * Shows as a modal/overlay on the prep detail page.
 */
export function PrepRoleplay({ prepId, signedUrl, prospectName, prospectRole, prospectCompany, onClose, onComplete }: PrepRoleplayProps) {
    const { mutateAsync: completePrepRoleplay, isPending: isCompleting } = useCompletePrepRoleplay();
    const [error, setError] = useState<string | null>(null);
    const [isRequestingMic, setIsRequestingMic] = useState(false);
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
            console.log('Prep roleplay status changed to:', status);
            // Track when conversation actually starts
            if (status === 'connected' && !sessionStartTimeRef.current) {
                sessionStartTimeRef.current = Date.now();
            }
        },
    });
    const { status, startSession: startConversation, endSession, getId: getConversationId } = conversation;

    // Auto-start when component mounts with signed URL
    useEffect(() => {
        if (!signedUrl || hasStartedRef.current) return;

        const startCall = async () => {
            try {
                setError(null);
                setIsRequestingMic(true);

                // Request microphone permission
                await navigator.mediaDevices.getUserMedia({ audio: true });
                setIsRequestingMic(false);

                hasStartedRef.current = true;
                startConversation({
                    signedUrl,
                    connectionType: 'websocket',
                });
            } catch (err) {
                setIsRequestingMic(false);
                if (err instanceof Error) {
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        setError('Microphone permission denied. Please allow microphone access to use voice roleplay.');
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

        startCall();
    }, [signedUrl, startConversation]);

    const retryConnection = async () => {
        hasStartedRef.current = false;
        setError(null);
        setIsRequestingMic(true);

        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsRequestingMic(false);
            hasStartedRef.current = true;
            startConversation({
                signedUrl,
                connectionType: 'websocket',
            });
        } catch {
            setIsRequestingMic(false);
            setError('Failed to access microphone');
        }
    };

    const endCall = () => {
        // Capture conversation ID before ending session
        const convId = getConversationId();
        if (convId) {
            conversationIdRef.current = convId;
        }

        try {
            endSession();
        } catch (err) {
            console.error('Error ending call:', err);
        }

        // Calculate session duration
        const duration = sessionStartTimeRef.current ? Math.round((Date.now() - sessionStartTimeRef.current) / 1000) : 0;

        // Generate mock results
        const mockRating = duration > 30 ? Math.floor(Math.random() * 20) + 70 : Math.floor(Math.random() * 20) + 50;
        setSessionResult({
            rating: mockRating,
            duration,
            feedback:
                duration > 30
                    ? ['Good meeting preparation', 'Strong opening approach', 'Consider more discovery questions']
                    : ['Try having a longer conversation', 'Practice building rapport'],
            strengths: duration > 30 ? ['Meeting agenda clarity', 'Confidence'] : ['Good start'],
        });
        setShowResults(true);
    };

    const handleRetry = () => {
        hasStartedRef.current = false;
        sessionStartTimeRef.current = null;
        conversationIdRef.current = null;
        setError(null);
        setSessionResult(null);
        setShowResults(false);
        retryConnection();
    };

    const handleComplete = async () => {
        try {
            const score = sessionResult?.rating != null ? Math.round((sessionResult.rating / 10) * 10) / 10 : undefined;
            await completePrepRoleplay({
                id: prepId,
                sessionData: {
                    conversationId: conversationIdRef.current ?? undefined,
                    score,
                    duration: sessionResult?.duration,
                },
            });
            setIsCompleted(true);
        } catch (err) {
            console.error('Failed to complete roleplay:', err);
            setIsCompleted(true);
        }
        onComplete();
    };

    const displayName = prospectName || 'Sales Prospect';
    const prospectPortrait = getPortraitForName(displayName);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/80 backdrop-blur-sm">
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

            <div className="card bg-base-100 shadow-2xl w-full max-w-lg mx-4">
                <div className="card-body">
                    {/* Header with close button */}
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="card-title text-lg">Meeting Roleplay Practice</h2>
                        <button
                            className="btn btn-ghost btn-sm btn-circle"
                            onClick={onClose}
                            disabled={status === 'connected'}
                            title={status === 'connected' ? 'End the call first' : 'Close'}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="alert alert-error mb-4">
                            <span>{error}</span>
                            <button type="button" className="btn btn-sm btn-outline" onClick={retryConnection}>
                                Retry
                            </button>
                        </div>
                    )}

                    {/* REQUESTING MIC STATE */}
                    {isRequestingMic && (
                        <div className="py-12 text-center">
                            <span className="loading loading-spinner loading-lg text-primary mb-4"></span>
                            <p className="text-base-content/70">Requesting microphone access...</p>
                        </div>
                    )}

                    {/* CONNECTING STATE */}
                    {!isRequestingMic && status === 'connecting' && (
                        <div className="py-12 text-center">
                            <div className="relative inline-block mb-6">
                                <div className="avatar">
                                    <div className="w-28 h-28 rounded-full ring-4 ring-primary/30 ring-offset-4 ring-offset-base-100 animate-pulse">
                                        <img src={prospectPortrait} alt={displayName} className="object-cover" />
                                    </div>
                                </div>
                                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                            </div>
                            <div className="flex justify-center gap-1 mb-4">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="w-2 h-2 rounded-full bg-primary animate-bounce"
                                        style={{ animationDelay: `${i * 150}ms` }}
                                    />
                                ))}
                            </div>
                            <p className="text-lg font-medium">Connecting...</p>
                            <p className="text-sm text-base-content/50 mt-1">Preparing {displayName}</p>
                        </div>
                    )}

                    {/* CONNECTED STATE */}
                    {status === 'connected' && (
                        <div className="space-y-6">
                            <div className="rounded-2xl bg-base-200/50 p-8 border border-base-content/5">
                                <div className="flex flex-col items-center">
                                    <div className="relative mb-6">
                                        <div className="relative">
                                            <div className="avatar" style={{ animation: 'glow 2s ease-in-out infinite' }}>
                                                <div className="w-32 h-32 rounded-full ring-4 ring-success ring-offset-4 ring-offset-base-200">
                                                    <img src={prospectPortrait} alt={displayName} className="object-cover" />
                                                </div>
                                            </div>
                                            <SpeakingRings isActive={true} />
                                        </div>
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

                                    <h3 className="text-xl font-semibold">{displayName}</h3>
                                    <p className="text-sm text-base-content/60 mb-6">
                                        {prospectRole ? `${prospectRole} at ` : ''}
                                        {prospectCompany}
                                    </p>

                                    <div className="flex items-center justify-center gap-1 h-12 mb-4">
                                        {Array.from({ length: 12 }).map((_, i) => (
                                            <WaveformBar key={i} index={i} isActive={true} />
                                        ))}
                                    </div>

                                    <p className="text-base-content/70 text-sm">Listening and responding...</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 text-success text-sm">
                                    <Mic className="w-4 h-4" />
                                    <span>Mic active</span>
                                </div>
                                <button type="button" className="btn btn-error flex-1 gap-2" onClick={endCall}>
                                    <PhoneOff className="w-4 h-4" />
                                    End Conversation
                                </button>
                            </div>
                        </div>
                    )}

                    {/* DISCONNECTED STATE (with error or initial) */}
                    {!isRequestingMic && status === 'disconnected' && !showResults && !error && (
                        <div className="py-12 text-center">
                            <div className="avatar mb-6">
                                <div className="w-24 h-24 rounded-full ring-4 ring-base-content/10 ring-offset-4 ring-offset-base-100">
                                    <img src={prospectPortrait} alt={displayName} className="object-cover grayscale opacity-60" />
                                </div>
                            </div>
                            <h2 className="text-xl font-semibold mb-2">Ready to Practice?</h2>
                            <p className="text-base-content/60 text-sm mb-6">
                                Practice your meeting with <span className="font-medium text-base-content">{displayName}</span>
                            </p>
                            <button type="button" className="btn btn-primary gap-2" onClick={retryConnection}>
                                <Phone className="w-4 h-4" />
                                Start Conversation
                            </button>
                        </div>
                    )}

                    {/* RESULTS STATE */}
                    {showResults && sessionResult && !isCompleted && (
                        <div className="py-6">
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/20 mb-4">
                                    <CheckCircle className="w-8 h-8 text-success" />
                                </div>
                                <h2 className="text-xl font-semibold mb-1">Roleplay Complete!</h2>
                                <p className="text-base-content/60 text-sm">Here's how you did</p>
                            </div>

                            <div className="rounded-2xl bg-base-200/50 p-6 mb-6 border border-base-content/5">
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

                                <div className="space-y-4">
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

                                    <div>
                                        <div className="flex items-center gap-2 text-sm font-medium text-base-content/70 mb-2">
                                            <MessageSquare className="w-4 h-4" />
                                            <span>Feedback</span>
                                        </div>
                                        <ul className="space-y-1.5">
                                            {sessionResult.feedback.map((item) => (
                                                <li key={item} className="text-sm text-base-content/60 flex items-start gap-2">
                                                    <span className="text-primary mt-1">-</span>
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button type="button" className="btn btn-outline flex-1 gap-2" onClick={handleRetry}>
                                    <RotateCcw className="w-4 h-4" />
                                    Try Again
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary flex-1 gap-2"
                                    onClick={handleComplete}
                                    disabled={isCompleting}
                                >
                                    {isCompleting ? (
                                        <>
                                            <span className="loading loading-spinner loading-sm" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            Done
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* COMPLETED STATE */}
                    {isCompleted && sessionResult && (
                        <div className="py-8 text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/20 mb-4">
                                <CheckCircle className="w-10 h-10 text-success" />
                            </div>
                            <h2 className="text-2xl font-bold text-success mb-2">Practice Complete!</h2>
                            <p className="text-base-content/60 mb-6">Great work preparing for your meeting!</p>
                            <button type="button" className="btn btn-ghost" onClick={onClose}>
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
