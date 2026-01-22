import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import {
    ArrowLeft,
    Target,
    Clock,
    User,
    Users,
    CheckCircle,
    RotateCcw,
    TrendingUp,
    TrendingDown,
    Lightbulb,
    Award,
    BookOpen,
    XCircle,
    Play,
    Pause,
    Star,
    Volume2,
} from 'lucide-react';
import { useStartScenarioSession, useTrainingScenario } from '#data/training';
import { EditableBattleCard } from '#/routes/insights/components/EditableBattleCard';
import type { BattleCard as BattleCardType } from '#data/battle-cards';
import { getPortraitForName } from '#util/portraits';
import { getDifficultyBadgeClass } from '#util/badges';

// Seed data for coworker examples - showing how other reps handled similar scenarios
const seedCoworkerExamples = [
    {
        id: 'sc1',
        repName: 'Marcus Johnson',
        timeAgo: '2 days ago',
        duration: '1:45',
        technique: 'Consultative Approach',
        transcription:
            "Before I show you pricing, let me make sure I understand your situation. What's the biggest challenge you're facing right now that brought you to this conversation?",
    },
    {
        id: 'sc2',
        repName: 'Sarah Kim',
        timeAgo: '1 week ago',
        duration: '2:30',
        technique: 'Value First Method',
        transcription:
            "Based on what you've shared, you're losing about 15 hours per week on manual reporting. At your team's hourly cost, that's roughly $3,000 per month. Our solution typically cuts that by 80%.",
    },
    {
        id: 'sc3',
        repName: 'Alex Chen',
        timeAgo: '4 days ago',
        duration: '1:15',
        technique: 'Empathy Bridge',
        transcription:
            'I totally get the timing concern. Many of our best customers felt the same way. What changed their mind was seeing how quickly they got results - usually within the first two weeks.',
    },
];

// Lazy load the audio training component
const ScenarioAudioTraining = lazy(() => import('./ScenarioAudioTraining'));

/**
 * ScenarioTrainingSession Component
 *
 * Training session page for skill-based roleplay scenarios with ElevenLabs AI.
 * Allows salespeople to practice specific skills (objection handling, pricing, etc.)
 * through AI-powered conversations.
 *
 * Route: /salesperson/:salespersonId/training/:scenarioId
 *
 * Flow:
 * 1. Pre-Session: Display scenario details, objectives, prospect info
 * 2. Active Session: ElevenLabs conversation interface with objectives sidebar
 * 3. Post-Session: Show completion status with options to retry or view assessment
 *
 * Architecture Notes:
 * - Uses lazy loading for AudioTraining component (code splitting)
 * - Leverages useStartScenarioSession hook for backend API calls
 * - DaisyUI components throughout for consistent styling
 * - Lucide icons only (no custom SVGs or emoji)
 */
export function ScenarioTrainingSession() {
    const [, params] = useRoute('/salesperson/:salespersonId/training/:scenarioId');
    const [, setLocation] = useLocation();
    const salespersonId = params?.salespersonId ?? '';
    const scenarioId = params?.scenarioId ?? '';

    // Check if we're in review mode (from Completed Training tab)
    // Parse all query params for the specific session being reviewed
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const isReviewMode = searchParams.get('review') === 'true';
    const reviewConversationId = searchParams.get('conversationId');
    const reviewScore = searchParams.get('score') ? parseFloat(searchParams.get('score')!) : null;
    const reviewDuration = searchParams.get('duration') ? parseInt(searchParams.get('duration')!, 10) : null;
    const reviewCompletedAt = searchParams.get('completedAt');

    const [sessionState, setSessionState] = useState<'pre-session' | 'active' | 'completed' | 'viewing-completed'>('pre-session');
    const [completedObjectives, setCompletedObjectives] = useState<Set<number>>(new Set());
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [sessionDuration, setSessionDuration] = useState<string>('0:00');

    // Audio playback state for viewing completed sessions
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioError, setAudioError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Track time during active session
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch scenario details on page load
    const { data: scenarioData, isPending: isLoadingScenario, error: scenarioError } = useTrainingScenario(scenarioId);

    // Only switch to viewing-completed mode if we're in review mode (from Completed Training tab)
    // Otherwise, always show pre-session so users can start a new training
    useEffect(() => {
        if (isReviewMode && scenarioData?.completedSession && sessionState === 'pre-session') {
            setSessionState('viewing-completed');
        }
    }, [scenarioData, sessionState, isReviewMode]);

    const {
        mutateAsync: startSession,
        data: sessionData,
        isPending: isStartingSession,
        error: sessionError,
        reset: resetMutation,
    } = useStartScenarioSession(scenarioId);

    // Timer effect for active sessions
    useEffect(() => {
        if (sessionState === 'active' && sessionStartTime) {
            timerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                setSessionDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [sessionState, sessionStartTime]);

    const handleStartSession = async () => {
        try {
            await startSession();
            setSessionState('active');
            setSessionStartTime(Date.now());
        } catch (err) {
            console.error('Failed to start scenario session:', err);
        }
    };

    const handleEndSession = () => {
        setSessionState('completed');
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
    };

    const handleRetry = () => {
        setSessionState('pre-session');
        setCompletedObjectives(new Set());
        setSessionStartTime(null);
        setSessionDuration('0:00');
        resetMutation();
    };

    const handleViewAssessment = () => {
        setLocation(`/salesperson/${salespersonId}`);
    };

    const toggleObjective = (index: number) => {
        setCompletedObjectives((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };

    // Get scenario data - use sessionData when active (has signedUrl etc), otherwise use scenarioData
    const scenario = sessionState === 'active' ? sessionData?.scenario : scenarioData?.scenario;

    // Get battle card data - available from both scenarioData and sessionData
    const battleCard = (sessionState === 'active' ? sessionData?.battleCard : scenarioData?.battleCard) as BattleCardType | null;

    // Loading state - show while fetching scenario details
    if (isLoadingScenario) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link to={`/salesperson/${salespersonId}`}>
                        <button type="button" className="btn btn-ghost btn-sm">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </button>
                    </Link>
                </div>
                <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            </div>
        );
    }

    // Error state - scenario fetch or session start failed
    if (scenarioError || sessionError) {
        const errorMessage = scenarioError
            ? 'Error loading training scenario. Please try again.'
            : sessionError instanceof Error
              ? sessionError.message
              : 'Failed to start training session. Please ensure you are logged in and try again.';

        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link to={`/salesperson/${salespersonId}`}>
                        <button type="button" className="btn btn-ghost btn-sm">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </button>
                    </Link>
                </div>
                <div className="alert alert-error">
                    <span>{errorMessage}</span>
                </div>
                {sessionError && (
                    <button type="button" className="btn btn-outline" onClick={handleRetry}>
                        Try Again
                    </button>
                )}
            </div>
        );
    }

    // VIEWING COMPLETED SESSION VIEW - When navigating from Completed Training tab
    // Use query params for session-specific data, fall back to scenarioData.completedSession for backwards compat
    if (sessionState === 'viewing-completed' && scenario) {
        // Prefer query params (specific session) over scenarioData (most recent session)
        const conversationId =
            reviewConversationId ?? (scenarioData?.completedSession?.trainingSession as { conversationId?: string } | null)?.conversationId;
        const score = reviewScore ?? (scenarioData?.completedSession?.trainingSession as { score?: number } | null)?.score ?? 0;
        const duration = reviewDuration ?? (scenarioData?.completedSession?.trainingSession as { duration?: number } | null)?.duration;
        const completedAt = reviewCompletedAt ?? scenarioData?.completedSession?.completedAt;

        const scoreOutOf100 = score * 10;
        const audioUrl = conversationId ? `/vantage/api/training/conversation/${conversationId}/audio` : null;

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

        const handleAudioEnded = () => setIsPlaying(false);
        const handleAudioError = () => {
            setAudioError('Recording not available');
            setIsPlaying(false);
        };

        const handlePracticeAgain = () => {
            setSessionState('pre-session');
        };

        return (
            <div className="space-y-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => window.history.back()} className="btn btn-ghost btn-sm">
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <Target className="h-6 w-6 text-primary" />
                            <h1 className="text-2xl font-bold">{scenario.title}</h1>
                        </div>
                        <p className="text-sm text-base-content/60 mt-1">Completed Training Session</p>
                    </div>
                </div>

                {/* Completed Training Hero */}
                <div className="card bg-gradient-to-br from-success/5 to-success/10 border border-success/20 shadow-xl">
                    <div className="card-body items-center text-center py-10">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/20 mb-4">
                            <CheckCircle className="w-10 h-10 text-success" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Training Completed</h2>
                        {completedAt && (
                            <p className="text-base-content/60 mb-6">Completed on {new Date(completedAt).toLocaleDateString()}</p>
                        )}

                        {/* Score and Duration */}
                        {(score != null || duration != null) && (
                            <div className="flex items-center justify-center gap-8 mb-6">
                                {score != null && (
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
                                        <span className="text-3xl font-bold">{scoreOutOf100}</span>
                                        <span className="text-sm text-base-content/60">/100</span>
                                    </div>
                                )}
                                {duration != null && (
                                    <div className="flex flex-col items-center">
                                        <Clock className="w-5 h-5 text-base-content/60 mb-1" />
                                        <span className="text-xl font-semibold">{formatDuration(duration)}</span>
                                        <span className="text-sm text-base-content/60">Duration</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Audio Recording Playback */}
                        {audioUrl && (
                            <div className="w-full max-w-md pt-6 border-t border-base-content/10">
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

                        {!audioUrl && (
                            <div className="bg-base-300/30 rounded-lg p-4 text-center text-base-content/60 w-full max-w-md">
                                <Volume2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No recording available for this training session</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button type="button" className="btn btn-outline gap-2" onClick={handlePracticeAgain}>
                        <RotateCcw className="h-4 w-4" />
                        Practice Again
                    </button>
                    <button type="button" className="btn btn-primary gap-2" onClick={() => setLocation(`/salesperson/${salespersonId}`)}>
                        Back to Training
                    </button>
                </div>
            </div>
        );
    }

    // PRE-SESSION VIEW
    if (sessionState === 'pre-session' && scenario) {
        const prospectName = scenario.prospectData?.name ?? 'Prospect';
        const prospectPortrait = getPortraitForName(prospectName);

        return (
            <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
                {/* Custom animations */}
                <style>{`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes slideInRight {
                        from { opacity: 0; transform: translateX(20px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                    @keyframes scaleIn {
                        from { opacity: 0; transform: scale(0.95); }
                        to { opacity: 1; transform: scale(1); }
                    }
                `}</style>

                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link to={`/salesperson/${salespersonId}`}>
                        <button type="button" className="btn btn-ghost btn-sm">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </button>
                    </Link>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <Target className="h-6 w-6 text-primary" />
                            <h1 className="text-2xl font-bold">{scenario.title}</h1>
                            {scenario.difficulty && (
                                <span className={`badge ${getDifficultyBadgeClass(scenario.difficulty)}`}>{scenario.difficulty}</span>
                            )}
                        </div>
                        <p className="text-sm text-base-content/60 mt-1">Prepare for your roleplay session</p>
                    </div>
                </div>

                {/* Hero section with prospect */}
                <div
                    className="card bg-gradient-to-br from-base-200 to-base-300 border border-base-content/10 shadow-xl overflow-hidden"
                    style={{ animation: 'scaleIn 0.5s ease-out 0.1s both' }}
                >
                    <div className="card-body">
                        {/* Prospect spotlight */}
                        <div className="text-center py-6">
                            <div className="avatar mb-4">
                                <div className="w-28 h-28 rounded-full ring-4 ring-primary/20 ring-offset-4 ring-offset-base-200 shadow-xl">
                                    <img src={prospectPortrait} alt={prospectName} className="object-cover" />
                                </div>
                            </div>
                            <h2 className="text-xl font-semibold mb-1">{prospectName}</h2>
                            {scenario.prospectData?.role && scenario.prospectData?.company && (
                                <p className="text-base-content/60 text-sm mb-2">
                                    {scenario.prospectData.role} at {scenario.prospectData.company}
                                </p>
                            )}
                            {scenario.prospectData?.personality && (
                                <p className="text-xs text-base-content/50 italic max-w-md mx-auto">
                                    "{scenario.prospectData.personality}"
                                </p>
                            )}
                        </div>

                        {/* Context */}
                        {scenario.context && (
                            <div className="bg-base-100/50 rounded-xl p-4 mb-4 backdrop-blur-sm">
                                <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-base-content/60">
                                    Scenario Context
                                </h3>
                                <p className="text-base-content/80">{scenario.context}</p>
                            </div>
                        )}

                        {/* Objectives */}
                        {scenario.objectives && scenario.objectives.length > 0 && (
                            <div className="bg-base-100/50 rounded-xl p-4 mb-4 backdrop-blur-sm">
                                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-base-content/60 flex items-center gap-2">
                                    <Target className="h-4 w-4" />
                                    Training Objectives
                                </h3>
                                <ul className="space-y-2">
                                    {scenario.objectives.map((objective, index) => (
                                        <li
                                            key={index}
                                            className="flex items-start gap-3 text-base-content/80"
                                            style={{ animation: `slideInRight 0.3s ease-out ${0.2 + index * 0.1}s both` }}
                                        >
                                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                                                {index + 1}
                                            </div>
                                            <span>{objective}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Duration */}
                        {scenario.duration && (
                            <div className="flex items-center justify-center gap-2 text-sm text-base-content/60 mb-4">
                                <Clock className="h-4 w-4" />
                                <span>Estimated duration: {scenario.duration}</span>
                            </div>
                        )}

                        {/* Start Button */}
                        <button
                            type="button"
                            className="btn btn-primary btn-lg w-full gap-3 group transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
                            onClick={handleStartSession}
                            disabled={isStartingSession}
                        >
                            {isStartingSession ? (
                                <>
                                    <span className="loading loading-spinner loading-sm" />
                                    Preparing session...
                                </>
                            ) : (
                                <>
                                    <Target className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                                    Start Roleplay Session
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Battle Card - Review before starting */}
                {battleCard && (
                    <div className="card bg-base-200 border border-base-content/30">
                        <div className="card-body">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-primary" />
                                Battle Card Reference
                            </h3>
                            <EditableBattleCard battleCard={battleCard} showPracticeButton={false} canEdit={false} />
                        </div>
                    </div>
                )}

                {/* Common Approaches and Mistakes */}
                {battleCard && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Common Successful Approaches */}
                        <div className="card bg-base-200 border border-base-content/30">
                            <div className="card-body">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <CheckCircle className="h-5 w-5 text-success" />
                                    Common Successful Approaches
                                </h3>
                                <ul className="space-y-3">
                                    {battleCard.approach?.map((item, index) => (
                                        <li key={index} className="flex items-start gap-2 text-sm">
                                            <div className="w-1.5 h-1.5 rounded-full bg-success mt-2 shrink-0" />
                                            <span className="text-base-content/80">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Common Mistakes to Avoid */}
                        <div className="card bg-base-200 border border-base-content/30">
                            <div className="card-body">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <XCircle className="h-5 w-5 text-error" />
                                    Common Mistakes to Avoid
                                </h3>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2 text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-error mt-2 shrink-0" />
                                        <span className="text-base-content/80">
                                            Jumping to solutions before fully understanding the concern
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2 text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-error mt-2 shrink-0" />
                                        <span className="text-base-content/80">Being defensive or dismissive of objections</span>
                                    </li>
                                    <li className="flex items-start gap-2 text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-error mt-2 shrink-0" />
                                        <span className="text-base-content/80">Over-promising features or timelines to close the deal</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* Where Coworkers Crushed This - Seed data examples */}
                <div className="card bg-base-200 border border-base-content/30">
                    <div className="card-body">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Users className="h-5 w-5 text-info" />
                                Where Coworkers Crushed This
                            </h3>
                            <span className="badge badge-secondary badge-sm">Real Examples</span>
                        </div>
                        <p className="text-sm text-base-content/60 mb-4">See how other reps successfully handled similar scenarios</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {seedCoworkerExamples.map((example) => (
                                <div key={example.id} className="group relative">
                                    <div className="bg-gradient-to-br from-base-300/50 to-base-300 rounded-lg p-4 border border-base-content/10 hover:border-primary/50 transition-all cursor-pointer hover:shadow-md">
                                        {/* Clip Preview */}
                                        <div className="relative bg-base-100/50 rounded-md mb-3 aspect-video flex items-center justify-center group-hover:bg-base-100/70 transition-colors">
                                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded-md" />
                                            <div className="relative z-10 flex flex-col items-center text-center">
                                                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center mb-2 group-hover:bg-primary/30 transition-colors">
                                                    <Play className="w-4 h-4 text-primary" />
                                                </div>
                                                <div className="text-xs text-base-content/60">{example.duration}</div>
                                            </div>
                                        </div>

                                        {/* Rep Info */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-6 h-6 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center">
                                                <span className="text-xs text-primary-content font-bold">{example.repName.charAt(0)}</span>
                                            </div>
                                            <div className="text-sm font-medium">{example.repName}</div>
                                            <div className="text-xs text-base-content/60">• {example.timeAgo}</div>
                                        </div>

                                        {/* Technique Tag */}
                                        <div className="text-sm font-medium text-primary mb-2">{example.technique}</div>

                                        {/* Transcription */}
                                        <div className="bg-base-100/30 rounded p-3 mb-3">
                                            <div className="text-xs text-base-content/60 mb-1">What they said:</div>
                                            <div className="text-sm italic line-clamp-3">"{example.transcription}"</div>
                                        </div>

                                        {/* Play Button */}
                                        <div className="flex justify-center">
                                            <button type="button" className="btn btn-ghost btn-xs h-8 hover:bg-primary/10">
                                                <Play className="w-3 h-3 mr-1" />
                                                Play Clip
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ACTIVE SESSION VIEW
    if (sessionState === 'active' && scenario) {
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3">
                                <Target className="h-6 w-6 text-primary" />
                                <h1 className="text-xl font-bold">{scenario.title}</h1>
                                {scenario.difficulty && (
                                    <span className={`badge ${getDifficultyBadgeClass(scenario.difficulty)}`}>{scenario.difficulty}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-base-content/60">
                        <Clock className="h-4 w-4" />
                        <span className="font-mono text-sm">{sessionDuration}</span>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Audio Training Interface - Takes 2 columns on large screens */}
                    <div className="lg:col-span-2 space-y-6">
                        <Suspense
                            fallback={
                                <div className="card bg-base-200 border border-base-content/30">
                                    <div className="card-body flex justify-center items-center p-8">
                                        <span className="loading loading-spinner loading-md mr-2"></span>
                                        <span>Loading voice training...</span>
                                    </div>
                                </div>
                            }
                        >
                            {sessionData && (
                                <ScenarioAudioTraining
                                    sessionData={sessionData}
                                    onEndSession={handleEndSession}
                                    onComplete={handleViewAssessment}
                                />
                            )}
                        </Suspense>

                        {/* Battle Card - Reference material for the roleplay */}
                        {battleCard && (
                            <div className="card bg-base-200 border border-base-content/30">
                                <div className="card-body">
                                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                                        <BookOpen className="h-5 w-5 text-primary" />
                                        Battle Card Reference
                                    </h3>
                                    <EditableBattleCard battleCard={battleCard} showPracticeButton={false} canEdit={false} />
                                </div>
                            </div>
                        )}

                        {/* Common Approaches and Mistakes */}
                        {battleCard && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Common Successful Approaches */}
                                <div className="card bg-base-200 border border-base-content/30">
                                    <div className="card-body p-4">
                                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                                            <CheckCircle className="h-4 w-4 text-success" />
                                            Common Successful Approaches
                                        </h3>
                                        <ul className="space-y-2">
                                            {battleCard.approach?.map((item, index) => (
                                                <li key={index} className="flex items-start gap-2 text-xs">
                                                    <div className="w-1 h-1 rounded-full bg-success mt-1.5 shrink-0" />
                                                    <span className="text-base-content/80">{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* Common Mistakes to Avoid */}
                                <div className="card bg-base-200 border border-base-content/30">
                                    <div className="card-body p-4">
                                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                                            <XCircle className="h-4 w-4 text-error" />
                                            Common Mistakes to Avoid
                                        </h3>
                                        <ul className="space-y-2">
                                            <li className="flex items-start gap-2 text-xs">
                                                <div className="w-1 h-1 rounded-full bg-error mt-1.5 shrink-0" />
                                                <span className="text-base-content/80">
                                                    Jumping to solutions before fully understanding the concern
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2 text-xs">
                                                <div className="w-1 h-1 rounded-full bg-error mt-1.5 shrink-0" />
                                                <span className="text-base-content/80">Being defensive or dismissive of objections</span>
                                            </li>
                                            <li className="flex items-start gap-2 text-xs">
                                                <div className="w-1 h-1 rounded-full bg-error mt-1.5 shrink-0" />
                                                <span className="text-base-content/80">
                                                    Over-promising features or timelines to close the deal
                                                </span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Objectives Sidebar */}
                    <div className="space-y-4">
                        {/* Prospect Card */}
                        {scenario.prospectData && (
                            <div className="card bg-base-200 border border-base-content/30">
                                <div className="card-body">
                                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Prospect
                                    </h3>
                                    <div className="flex items-start gap-3">
                                        <div className="avatar">
                                            <div className="w-12 h-12 rounded-full">
                                                <img
                                                    src={getPortraitForName(scenario.prospectData.name ?? 'Prospect')}
                                                    alt={scenario.prospectData.name ?? 'Prospect'}
                                                    className="object-cover"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium">{scenario.prospectData.name ?? 'Prospect'}</div>
                                            {scenario.prospectData.role && scenario.prospectData.company && (
                                                <div className="text-sm text-base-content/60">
                                                    {scenario.prospectData.role} at {scenario.prospectData.company}
                                                </div>
                                            )}
                                            {scenario.prospectData.personality && (
                                                <div className="text-xs text-base-content/50 mt-1 italic">
                                                    {scenario.prospectData.personality}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Context Card */}
                        {scenario.context && (
                            <div className="card bg-base-200 border border-base-content/30">
                                <div className="card-body">
                                    <h3 className="font-semibold mb-2">Context</h3>
                                    <p className="text-sm text-base-content/70">{scenario.context}</p>
                                </div>
                            </div>
                        )}

                        {/* Objectives Card */}
                        {scenario.objectives && scenario.objectives.length > 0 && (
                            <div className="card bg-base-200 border border-base-content/30">
                                <div className="card-body">
                                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                                        <Target className="h-4 w-4" />
                                        Training Objectives
                                    </h3>
                                    <ul className="space-y-2">
                                        {scenario.objectives.map((objective, index) => (
                                            <li key={index}>
                                                <label className="flex items-start gap-2 cursor-pointer hover:bg-base-200 p-2 rounded transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        className="checkbox checkbox-sm checkbox-primary mt-0.5 flex-shrink-0"
                                                        checked={completedObjectives.has(index)}
                                                        onChange={() => toggleObjective(index)}
                                                    />
                                                    <span
                                                        className={`text-sm ${completedObjectives.has(index) ? 'line-through text-base-content/50' : 'text-base-content/80'}`}
                                                    >
                                                        {objective}
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-3 pt-3 border-t border-base-content/20">
                                        <div className="text-sm text-base-content/60">
                                            {completedObjectives.size} of {scenario.objectives.length} objectives completed
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // POST-SESSION VIEW
    if (sessionState === 'completed' && scenario) {
        const objectivesTotal = scenario.objectives?.length ?? 0;
        const objectivesCompleted = completedObjectives.size;
        const completionRate = objectivesTotal > 0 ? Math.round((objectivesCompleted / objectivesTotal) * 100) : 0;
        const prospectName = scenario.prospectData?.name ?? 'the AI prospect';
        const prospectPortrait = getPortraitForName(prospectName);

        // Generate mock feedback based on objectives (in a real app, this would come from AI analysis)
        const mockStrengths = [
            'Maintained professional demeanor throughout the conversation',
            'Asked clarifying questions to understand prospect needs',
            completedObjectives.size > 0 ? `Successfully addressed ${completedObjectives.size} training objectives` : null,
        ].filter(Boolean) as string[];

        const mockImprovements = [
            objectivesTotal > objectivesCompleted ? 'Could explore prospect concerns more deeply' : null,
            'Consider using more specific examples and case studies',
            'Work on transitioning between discovery and value presentation',
        ].filter(Boolean) as string[];

        const mockCoaching =
            completionRate >= 70
                ? "Great job on this session! Focus on building rapport early in the conversation and using the prospect's own words when presenting solutions."
                : "Good effort! Next time, try to spend more time in discovery before presenting solutions. Understanding the prospect's specific pain points will help you tailor your pitch.";

        const mockTakeaways = [
            'Active listening builds trust and uncovers hidden needs',
            'Tie features to specific business outcomes the prospect cares about',
            'Address objections by acknowledging and reframing, not dismissing',
        ];

        // Determine score color
        const getScoreColor = () => {
            if (completionRate >= 80) return 'text-success';
            if (completionRate >= 50) return 'text-warning';
            return 'text-error';
        };

        return (
            <div className="space-y-6 max-w-4xl mx-auto">
                {/* Custom animations */}
                <style>{`
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes scaleIn {
                        from { opacity: 0; transform: scale(0.9); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    @keyframes countUp {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes checkmark {
                        from { stroke-dashoffset: 50; }
                        to { stroke-dashoffset: 0; }
                    }
                `}</style>

                {/* Header */}
                <div className="flex items-center gap-4" style={{ animation: 'fadeInUp 0.4s ease-out' }}>
                    <Link to={`/salesperson/${salespersonId}`}>
                        <button type="button" className="btn btn-ghost btn-sm">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Training
                        </button>
                    </Link>
                </div>

                {/* Hero completion card */}
                <div
                    className="card bg-gradient-to-br from-base-200 to-base-300 border border-base-content/10 shadow-xl overflow-hidden"
                    style={{ animation: 'scaleIn 0.5s ease-out 0.1s both' }}
                >
                    <div className="card-body items-center text-center py-10">
                        {/* Completion badge with prospect */}
                        <div className="relative mb-6">
                            {/* Success ring animation */}
                            <div
                                className="absolute inset-0 rounded-full border-4 border-success/30 animate-ping"
                                style={{ animationDuration: '2s' }}
                            />
                            <div className="avatar">
                                <div className="w-28 h-28 rounded-full ring-4 ring-success ring-offset-4 ring-offset-base-200 shadow-xl">
                                    <img src={prospectPortrait} alt={prospectName} className="object-cover" />
                                </div>
                            </div>
                            {/* Checkmark overlay */}
                            <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-success rounded-full flex items-center justify-center shadow-lg">
                                <CheckCircle className="w-6 h-6 text-success-content" />
                            </div>
                        </div>

                        <h2 className="text-2xl font-bold mb-2" style={{ animation: 'countUp 0.4s ease-out 0.3s both' }}>
                            Session Complete!
                        </h2>
                        <p className="text-base-content/60 mb-6" style={{ animation: 'countUp 0.4s ease-out 0.4s both' }}>
                            Great practice session with {prospectName}
                        </p>

                        {/* Score display */}
                        <div
                            className="bg-base-100/50 rounded-2xl px-8 py-6 backdrop-blur-sm"
                            style={{ animation: 'scaleIn 0.4s ease-out 0.5s both' }}
                        >
                            <div className={`text-5xl font-bold ${getScoreColor()} mb-1`}>{completionRate}%</div>
                            <div className="text-sm text-base-content/60">Objectives Completed</div>
                            <div className="text-xs text-base-content/40 mt-1">
                                {objectivesCompleted} of {objectivesTotal} objectives
                            </div>
                        </div>
                    </div>
                </div>

                {/* Feedback Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* What You Did Well - Green */}
                    <div
                        className="card bg-gradient-to-br from-success/5 to-success/10 border border-success/20 shadow-lg"
                        style={{ animation: 'fadeInUp 0.4s ease-out 0.6s both' }}
                    >
                        <div className="card-body">
                            <h3 className="card-title text-lg flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                                    <TrendingUp className="h-4 w-4 text-success" />
                                </div>
                                What You Did Well
                            </h3>
                            <ul className="space-y-3 mt-3">
                                {mockStrengths.map((strength, index) => (
                                    <li key={index} className="flex items-start gap-3 text-sm">
                                        <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                                        <span className="text-base-content/80">{strength}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Areas to Improve - Warning/Orange */}
                    <div
                        className="card bg-gradient-to-br from-warning/5 to-warning/10 border border-warning/20 shadow-lg"
                        style={{ animation: 'fadeInUp 0.4s ease-out 0.7s both' }}
                    >
                        <div className="card-body">
                            <h3 className="card-title text-lg flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center">
                                    <TrendingDown className="h-4 w-4 text-warning" />
                                </div>
                                Areas to Improve
                            </h3>
                            <ul className="space-y-3 mt-3">
                                {mockImprovements.map((improvement, index) => (
                                    <li key={index} className="flex items-start gap-3 text-sm">
                                        <div className="w-4 h-4 rounded-full border-2 border-warning flex-shrink-0 mt-0.5" />
                                        <span className="text-base-content/80">{improvement}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Coach's Advice - Info/Blue */}
                <div
                    className="card bg-gradient-to-br from-info/5 to-info/10 border border-info/20 shadow-lg"
                    style={{ animation: 'fadeInUp 0.4s ease-out 0.8s both' }}
                >
                    <div className="card-body">
                        <h3 className="card-title text-lg flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-info/20 flex items-center justify-center">
                                <Lightbulb className="h-4 w-4 text-info" />
                            </div>
                            Coach's Advice
                        </h3>
                        <p className="text-base-content/80 mt-3 leading-relaxed">{mockCoaching}</p>
                    </div>
                </div>

                {/* Key Takeaways - Primary/Purple */}
                <div
                    className="card bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 shadow-lg"
                    style={{ animation: 'fadeInUp 0.4s ease-out 0.9s both' }}
                >
                    <div className="card-body">
                        <h3 className="card-title text-lg flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Award className="h-4 w-4 text-primary" />
                            </div>
                            Key Takeaways
                        </h3>
                        <ul className="space-y-3 mt-3">
                            {mockTakeaways.map((takeaway, index) => (
                                <li key={index} className="flex items-start gap-3 text-sm">
                                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                                        {index + 1}
                                    </div>
                                    <span className="text-base-content/80">{takeaway}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Objectives Review */}
                {scenario.objectives && scenario.objectives.length > 0 && (
                    <div
                        className="card bg-base-200 border border-base-content/10 shadow-lg"
                        style={{ animation: 'fadeInUp 0.4s ease-out 1s both' }}
                    >
                        <div className="card-body">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <Target className="h-4 w-4 text-primary" />
                                Objectives Review
                            </h3>
                            <ul className="space-y-3">
                                {scenario.objectives.map((objective, index) => (
                                    <li key={index} className="flex items-start gap-3">
                                        {completedObjectives.has(index) ? (
                                            <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                                        ) : (
                                            <div className="h-5 w-5 rounded-full border-2 border-base-content/20 flex-shrink-0 mt-0.5" />
                                        )}
                                        <span className={completedObjectives.has(index) ? 'text-base-content/80' : 'text-base-content/50'}>
                                            {objective}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center" style={{ animation: 'fadeInUp 0.4s ease-out 1.1s both' }}>
                    <button
                        type="button"
                        className="btn btn-outline gap-2 transition-all duration-300 hover:scale-[1.02]"
                        onClick={handleRetry}
                    >
                        <RotateCcw className="h-4 w-4" />
                        Practice Again
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary gap-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
                        onClick={handleViewAssessment}
                    >
                        Back to Training
                    </button>
                </div>

                {/* Progress Note */}
                <div className="text-center" style={{ animation: 'fadeInUp 0.4s ease-out 1.2s both' }}>
                    <p className="text-xs text-base-content/40">Your progress is being tracked to provide personalized recommendations</p>
                </div>
            </div>
        );
    }

    // Fallback
    return null;
}
