import { useState } from 'react';
import { tw } from '#util/tw';
import { formatTimeAgo, formatDateShort } from '#util';
import { ho } from '#data/client';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { MediaPlayer } from '#/components/MediaPlayer';
import {
    Phone,
    Search,
    ChevronDown,
    ChevronUp,
    Video,
    Volume2,
    TrendingUp,
    CheckCircle,
    FlagIcon,
    Target,
    GraduationCap,
    Trophy,
    Clock,
    Users,
    User,
    Building2,
    Mail,
    Briefcase,
    MessageSquare,
    AlertTriangle,
    FileText,
} from 'lucide-react';

const PageContainer = tw.div`space-y-6 p-6`;
const Card = tw.div`bg-base-200 rounded-lg border border-base-content/30`;
const CardHeader = tw.div`p-4 border-b border-base-content/20`;
const CardTitle = tw.h2`text-lg font-semibold`;
const CardContent = tw.div``;

interface CallFlag {
    id: number;
    reason: string | null;
    flagData: {
        flag_title: string;
        what_happened: string;
        better_response: string | string[];
        why_this_matters: string;
        timestamps?: { start?: string; end?: string };
        transcript_segment?: string[];
    } | null;
}

interface CallObjection {
    id: number;
    interactionId: number;
    objectionId: number;
    objectionTitle: string;
    wasOvercome: boolean | null;
    verbatimQuote: string | null;
    timestampStart: string | null;
    timestampEnd: string | null;
    salesPhase: string | null;
}

interface CallPainPoint {
    id: number;
    interactionId: number;
    painPointId: number;
    painPointTitle: string;
    isProspectPain: boolean;
    wasResolved: boolean | null;
    verbatimQuote: string | null;
    timestampStart: string | null;
    timestampEnd: string | null;
    salesPhase: string | null;
}

interface Call {
    id: number;
    blurb: string;
    createdAt: string | null;
    processedStatus: string;
    salespersonId: number;
    v1_raw_google_diarized: any;
    metadata: {
        prospect?: {
            name?: string;
            company?: string;
            companySize?: string;
            title?: string;
            email?: string;
            phone?: string;
        };
        company?: {
            industry?: string;
        };
        context?: {
            callDuration?: string;
            callDate?: string;
            callType?: string;
        };
        communication?: {
            tone?: string;
            concerns?: string[];
        };
        summary?: {
            overview?: string;
            topicsDiscussed?: string[];
            outcome?: string;
            nextSteps?: string[];
            keyMoments?: string[];
        };
    } | null;
    files: Array<{
        id: number;
        fileName: string;
        filePath: string;
        mimeType: string | null;
    }>;
    ratings: Array<{
        id: number;
        value: number;
        blurb: string;
        type: string;
    }>;
    skillsAssessments: Array<{
        id: number;
        objectionHandlingScore: number;
        pricingDiscussionsScore: number;
        discoveryFeaturesScore: number;
        closingScore: number;
        assessmentData: any;
    }>;
    flags: CallFlag[];
    salesperson: {
        id: number;
        firstName: string;
        lastName: string;
        avatar: string | null;
    } | null;
    objections: CallObjection[];
    painPoints: CallPainPoint[];
}

interface CompletedTrainingItem {
    id: string;
    type: string;
    title: string;
    description: string | null;
    repName: string;
    salespersonId: number;
    completedAt: string | null;
    source: string;
    score?: number | null;
    duration?: number | null;
    conversationId?: string | null;
    scenarioId?: string | null;
}

function CallDetailView({ call, onClose }: { call: Call; onClose: () => void }) {
    const [, navigate] = useLocation();
    const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
    const mediaFile = call.files?.find(f => f.mimeType?.startsWith('video/')) ?? call.files?.[0];
    const rating = call.ratings?.[0];
    const skills = call.skillsAssessments?.[0];
    const callFlags = call.flags ?? [];
    const transcription = call.v1_raw_google_diarized;
    const prospect = call.metadata?.prospect;
    const company = call.metadata?.company;
    const context = call.metadata?.context;
    const communication = call.metadata?.communication;
    const callSummary = call.metadata?.summary;
    const salesperson = call.salesperson;

    // Determine if this is a video file
    const isVideo = mediaFile?.mimeType?.startsWith('video/');

    const getScoreColor = (score: number) => {
        if (score >= 8) return 'badge-success';
        if (score >= 6) return 'badge-warning';
        return 'badge-error';
    };

    const getRatingColor = (value: number) => {
        if (value >= 80) return 'text-success';
        if (value >= 60) return 'text-warning';
        return 'text-error';
    };

    // Check if we have any metadata to display
    const hasMetadata = prospect || company || context || salesperson;
    const hasCallSummary =
        callSummary?.overview ||
        callSummary?.topicsDiscussed?.length ||
        callSummary?.outcome ||
        callSummary?.nextSteps?.length ||
        callSummary?.keyMoments?.length;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-base-200 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-base-content/30">
                <div className="sticky top-0 bg-base-200 border-b border-base-content/20 p-6">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold">{call.blurb}</h2>
                            <p className="text-sm text-base-content/70">
                                {call.createdAt ? formatTimeAgo(call.createdAt) : 'Unknown date'}
                            </p>
                        </div>
                        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                            X
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Call Details / Metadata Section */}
                    {hasMetadata && (
                        <div className="bg-base-300 rounded-lg p-4 space-y-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" />
                                Call Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Prospect Info */}
                                {prospect && (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-medium text-base-content/70 uppercase tracking-wide">Prospect</h4>
                                        <div className="space-y-1">
                                            {prospect.name && (
                                                <div className="flex items-center gap-2">
                                                    <User className="h-4 w-4 text-base-content/50" />
                                                    <span className="font-medium">{prospect.name}</span>
                                                </div>
                                            )}
                                            {prospect.title && (
                                                <div className="flex items-center gap-2">
                                                    <Briefcase className="h-4 w-4 text-base-content/50" />
                                                    <span className="text-sm">{prospect.title}</span>
                                                </div>
                                            )}
                                            {prospect.company && (
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-base-content/50" />
                                                    <span className="text-sm">{prospect.company}</span>
                                                    {prospect.companySize && (
                                                        <span className="badge badge-sm badge-outline">{prospect.companySize}</span>
                                                    )}
                                                </div>
                                            )}
                                            {company?.industry && (
                                                <div className="text-sm text-base-content/60 ml-6">Industry: {company.industry}</div>
                                            )}
                                            {prospect.email && (
                                                <div className="flex items-center gap-2">
                                                    <Mail className="h-4 w-4 text-base-content/50" />
                                                    <span className="text-sm">{prospect.email}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Rep & Context Info */}
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-base-content/70 uppercase tracking-wide">Call Info</h4>
                                    <div className="space-y-1">
                                        {salesperson && (
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4 text-secondary" />
                                                <span className="font-medium">
                                                    {salesperson.firstName} {salesperson.lastName}
                                                </span>
                                                <span className="text-xs text-base-content/50">(Rep)</span>
                                            </div>
                                        )}
                                        {context?.callDuration && (
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-base-content/50" />
                                                <span className="text-sm">Duration: {context.callDuration}</span>
                                            </div>
                                        )}
                                        {context?.callType && (
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-4 w-4 text-base-content/50" />
                                                <span className="text-sm">Type: {context.callType}</span>
                                            </div>
                                        )}
                                        {communication?.tone && (
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="h-4 w-4 text-base-content/50" />
                                                <span className="text-sm">Tone: {communication.tone}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Call Summary Section */}
                    {hasCallSummary && (
                        <div className="bg-base-300 rounded-lg p-4 space-y-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <FileText className="h-5 w-5 text-info" />
                                Call Summary
                            </h3>

                            {/* Overview */}
                            {callSummary?.overview && <div className="text-sm text-base-content/80">{callSummary.overview}</div>}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Topics Discussed */}
                                {callSummary?.topicsDiscussed && callSummary.topicsDiscussed.length > 0 && (
                                    <div className="bg-info/10 rounded-lg p-3">
                                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                            <MessageSquare className="h-4 w-4 text-info" />
                                            Topics Discussed
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {callSummary.topicsDiscussed.map((topic, idx) => (
                                                <span key={idx} className="badge badge-outline badge-sm">
                                                    {topic}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Outcome */}
                                {callSummary?.outcome && (
                                    <div className="bg-primary/10 rounded-lg p-3">
                                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                            <Target className="h-4 w-4 text-primary" />
                                            Outcome
                                        </h4>
                                        <p className="text-sm">{callSummary.outcome}</p>
                                    </div>
                                )}

                                {/* Next Steps */}
                                {callSummary?.nextSteps && callSummary.nextSteps.length > 0 && (
                                    <div className="bg-success/10 rounded-lg p-3">
                                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                            <CheckCircle className="h-4 w-4 text-success" />
                                            Next Steps
                                        </h4>
                                        <ul className="space-y-1">
                                            {callSummary.nextSteps.map((step, idx) => (
                                                <li key={idx} className="text-sm flex items-start gap-2">
                                                    <span className="text-success">•</span>
                                                    {step}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Key Moments */}
                                {callSummary?.keyMoments && callSummary.keyMoments.length > 0 && (
                                    <div className="bg-warning/10 rounded-lg p-3">
                                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                            <AlertTriangle className="h-4 w-4 text-warning" />
                                            Key Moments
                                        </h4>
                                        <ul className="space-y-1">
                                            {callSummary.keyMoments.map((moment, idx) => (
                                                <li key={idx} className="text-sm flex items-start gap-2">
                                                    <span className="text-warning">•</span>
                                                    {moment}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Media Player - Video or Audio */}
                    {mediaFile && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                {isVideo ? <Video className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                <span>Recording</span>
                                {callFlags.length > 0 && (
                                    <span className="text-base-content/60 text-xs">
                                        ({callFlags.length} flag{callFlags.length !== 1 ? 's' : ''} marked on timeline)
                                    </span>
                                )}
                            </div>
                            <MediaPlayer
                                fileId={mediaFile.id}
                                mimeType={mediaFile.mimeType}
                                flags={callFlags.map((flag) => ({
                                    id: flag.id,
                                    timestamp: flag.flagData?.timestamps?.start ?? null,
                                    title: flag.flagData?.flag_title ?? flag.reason ?? 'Training Flag',
                                }))}
                                onFlagClick={(flagId) => {
                                    onClose();
                                    navigate(`/training-flag/${flagId}`);
                                }}
                            />
                        </div>
                    )}

                    {rating && (
                        <div className="bg-base-200 rounded-lg p-4">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-primary" />
                                    <span className="font-semibold">Overall Score:</span>
                                </div>
                                <span className={`font-bold text-2xl ${getRatingColor(rating.value)}`}>{rating.value}/100</span>
                            </div>
                            <p className="text-sm text-base-content/70">{rating.blurb}</p>
                        </div>
                    )}

                    {skills && (
                        <div className="space-y-3">
                            <h3 className="font-semibold">Skills Performance</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-base-200 rounded-lg p-3 text-center">
                                    <div className={`badge ${getScoreColor(skills.objectionHandlingScore)} mb-2`}>
                                        {skills.objectionHandlingScore}/10
                                    </div>
                                    <div className="text-xs text-base-content/70">Objection Handling</div>
                                </div>
                                <div className="bg-base-200 rounded-lg p-3 text-center">
                                    <div className={`badge ${getScoreColor(skills.pricingDiscussionsScore)} mb-2`}>
                                        {skills.pricingDiscussionsScore}/10
                                    </div>
                                    <div className="text-xs text-base-content/70">Pricing</div>
                                </div>
                                <div className="bg-base-200 rounded-lg p-3 text-center">
                                    <div className={`badge ${getScoreColor(skills.discoveryFeaturesScore)} mb-2`}>
                                        {skills.discoveryFeaturesScore}/10
                                    </div>
                                    <div className="text-xs text-base-content/70">Discovery</div>
                                </div>
                                <div className="bg-base-200 rounded-lg p-3 text-center">
                                    <div className={`badge ${getScoreColor(skills.closingScore)} mb-2`}>{skills.closingScore}/10</div>
                                    <div className="text-xs text-base-content/70">Closing</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Flags from this call */}
                    {callFlags.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="font-semibold flex items-center gap-2">
                                <FlagIcon className="h-5 w-5 text-warning" />
                                Training Flags ({callFlags.length})
                            </h3>
                            <div className="space-y-2">
                                {callFlags.map((flag) => (
                                    <button
                                        type="button"
                                        key={flag.id}
                                        onClick={() => {
                                            onClose();
                                            navigate(`/training-flag/${flag.id}`);
                                        }}
                                        className="w-full text-left bg-warning/10 border border-warning/20 rounded-lg p-4 hover:bg-warning/20 transition-colors cursor-pointer"
                                    >
                                        <div className="font-medium text-sm mb-1">
                                            {flag.flagData?.flag_title ?? flag.reason ?? 'Training Flag'}
                                        </div>
                                        {flag.flagData?.what_happened && (
                                            <div className="text-xs text-base-content/70">{flag.flagData.what_happened}</div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {skills?.assessmentData?.skills && (
                        <div className="space-y-3">
                            <h3 className="font-semibold">Detailed Skill Analysis</h3>
                            <div className="space-y-3">
                                {Object.entries(skills.assessmentData.skills).map(([skillKey, skillData]: [string, any]) => (
                                    <div key={skillKey} className="bg-base-200 rounded-lg p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium capitalize">{skillKey.replace(/_/g, ' ')}</span>
                                            {typeof skillData.score === 'number' && (
                                                <span className={`badge ${getScoreColor(skillData.score)}`}>{skillData.score}/10</span>
                                            )}
                                        </div>
                                        <div className="text-sm text-base-content/70">
                                            <strong>Evidence:</strong> {skillData.evidence}
                                        </div>
                                        {skillData.missed_opportunity && (
                                            <div className="text-sm text-warning">
                                                <strong>Missed Opportunity:</strong> {skillData.missed_opportunity}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {transcription && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">Full Transcription</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
                                    className="btn btn-ghost btn-xs"
                                >
                                    {isTranscriptExpanded ? (
                                        <>
                                            <ChevronUp className="h-4 w-4" /> Hide
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="h-4 w-4" /> Show
                                        </>
                                    )}
                                </button>
                            </div>
                            {isTranscriptExpanded && (
                                <div className="bg-base-200 rounded-lg p-4 max-h-96 overflow-y-auto space-y-3">
                                    {transcription.segments?.map((segment: any, idx: number) => (
                                        <div key={idx} className="space-y-1">
                                            <div className="font-medium text-xs text-primary">Speaker {segment.speaker}</div>
                                            <div className="text-sm text-base-content/80">{segment.text}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CallCard({ call, onClick }: { call: Call; onClick: () => void }) {
    const rating = call.ratings?.[0];
    const flagCount = call.flags?.length ?? 0;
    const mediaFile = call.files?.find(f => f.mimeType?.startsWith('video/')) ?? call.files?.[0];
    const isVideo = mediaFile?.mimeType?.startsWith('video/');
    const prospect = call.metadata?.prospect;
    const salesperson = call.salesperson;

    const getRatingColor = (value: number) => {
        if (value >= 80) return 'text-success';
        if (value >= 60) return 'text-warning';
        return 'text-error';
    };

    return (
        <div
            onClick={onClick}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
            role="button"
            tabIndex={0}
            className="p-4 hover:bg-base-200/50 transition-colors cursor-pointer border-b border-base-300 last:border-b-0"
        >
            <div className="flex items-center gap-4">
                {/* Media Thumbnail */}
                {mediaFile && (
                    <div className="flex-shrink-0 w-24 h-16 bg-base-300 rounded-lg flex items-center justify-center overflow-hidden">
                        {isVideo ? (
                            <Video className="h-6 w-6 text-base-content/50" />
                        ) : (
                            <Volume2 className="h-6 w-6 text-base-content/50" />
                        )}
                    </div>
                )}

                {/* Call Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{call.blurb}</h3>
                    <div className="flex items-center gap-4 text-sm text-base-content/60 mt-1">
                        <span>{call.createdAt ? formatTimeAgo(call.createdAt) : 'Unknown date'}</span>
                        {salesperson && (
                            <>
                                <span>•</span>
                                <div className="flex items-center gap-1.5">
                                    {salesperson.avatar ? (
                                        <img
                                            src={salesperson.avatar}
                                            alt={`${salesperson.firstName} ${salesperson.lastName}`}
                                            className="h-5 w-5 rounded-full object-cover"
                                        />
                                    ) : (
                                        <User className="h-4 w-4" />
                                    )}
                                    <span>
                                        {salesperson.firstName} {salesperson.lastName}
                                    </span>
                                </div>
                            </>
                        )}
                        {prospect?.company && (
                            <>
                                <span>•</span>
                                <div className="flex items-center gap-1.5">
                                    <Building2 className="h-4 w-4" />
                                    <span>{prospect.company}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-4">
                    {rating && (
                        <div className="text-center">
                            <div className={`text-lg font-bold ${getRatingColor(rating.value)}`}>{rating.value}%</div>
                            <div className="text-xs text-base-content/60">Score</div>
                        </div>
                    )}

                    {flagCount > 0 && (
                        <div className="flex items-center gap-1 text-warning text-sm">
                            <FlagIcon className="h-4 w-4" />
                            <span>{flagCount}</span>
                        </div>
                    )}

                    {call.processedStatus !== 'processed' && <span className="badge badge-warning badge-sm">{call.processedStatus}</span>}

                    <button type="button" className="btn btn-sm btn-ghost">
                        View
                    </button>
                </div>
            </div>
        </div>
    );
}

function CallRecordingsTab() {
    const [selectedCall, setSelectedCall] = useState<Call | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRep, setSelectedRep] = useState<string>('all');
    const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all');

    const {
        data: callsData,
        isPending,
        error,
    } = useQuery({
        queryKey: ['all-calls'],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople.allCalls.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch calls');
            }
            const data = await response.json();
            return data.interactions ?? [];
        },
    });

    // Get unique salespeople for filter dropdown
    const uniqueSalespeople = [
        ...new Map((callsData ?? []).filter((call) => call.salesperson).map((call) => [call.salesperson!.id, call.salesperson!])).values(),
    ];

    // Filter by time range
    const filterByTimeRange = (call: Call) => {
        if (selectedTimeRange === 'all') return true;
        if (!call.createdAt) return false;
        const callDate = new Date(call.createdAt);
        const now = new Date();
        switch (selectedTimeRange) {
            case 'today':
                return callDate.toDateString() === now.toDateString();
            case 'week': {
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return callDate >= weekAgo;
            }
            case 'month': {
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                return callDate >= monthAgo;
            }
            default:
                return true;
        }
    };

    const filteredCalls =
        callsData?.filter((call) => {
            const matchesSearch =
                call.blurb.toLowerCase().includes(searchQuery.toLowerCase()) ||
                call.salesperson?.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                call.salesperson?.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                call.metadata?.prospect?.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                call.metadata?.prospect?.name?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRep = selectedRep === 'all' || call.salesperson?.id.toString() === selectedRep;
            const matchesTime = filterByTimeRange(call);
            return matchesSearch && matchesRep && matchesTime;
        }) ?? [];

    const sortedCalls = [...filteredCalls].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });

    if (isPending) {
        return (
            <div className="flex justify-center items-center h-64">
                <span className="loading loading-spinner loading-lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-error">
                <span>Error loading calls: {error.message}</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Filters Section - Grid Layout like Lovable */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search Input */}
                <div className="lg:col-span-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search calls..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input input-bordered w-full pl-10"
                        />
                    </div>
                </div>

                {/* Rep Filter */}
                <select value={selectedRep} onChange={(e) => setSelectedRep(e.target.value)} className="select select-bordered w-full">
                    <option value="all">All Reps</option>
                    {uniqueSalespeople.map((sp) => (
                        <option key={sp.id} value={sp.id.toString()}>
                            {sp.firstName} {sp.lastName}
                        </option>
                    ))}
                </select>

                {/* Time Range Filter */}
                <select
                    value={selectedTimeRange}
                    onChange={(e) => setSelectedTimeRange(e.target.value)}
                    className="select select-bordered w-full"
                >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                </select>
            </div>

            {/* Results count and clear filters */}
            <div className="flex items-center justify-between">
                <div className="badge badge-outline badge-lg">{sortedCalls.length} calls</div>
                {(searchQuery || selectedRep !== 'all' || selectedTimeRange !== 'all') && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                            setSearchQuery('');
                            setSelectedRep('all');
                            setSelectedTimeRange('all');
                        }}
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Call List */}
            <Card>
                <CardHeader>
                    <CardTitle>Call Recordings</CardTitle>
                </CardHeader>
                <CardContent>
                    {sortedCalls.length > 0 ? (
                        sortedCalls.map((call) => <CallCard key={call.id} call={call} onClick={() => setSelectedCall(call)} />)
                    ) : (
                        <div className="text-center py-12 text-base-content/60">
                            <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <h3 className="font-medium mb-2">{searchQuery ? 'No calls found' : 'No calls yet'}</h3>
                            <p className="text-sm">
                                {searchQuery ? 'Try adjusting your search' : 'Call recordings will appear here once uploaded and processed'}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedCall && <CallDetailView call={selectedCall} onClose={() => setSelectedCall(null)} />}
        </div>
    );
}

function getTypeIcon(type: string) {
    switch (type) {
        case 'flag_review':
            return FlagIcon;
        case 'battle_card':
            return Target;
        case 'scenario':
            return GraduationCap;
        default:
            return Trophy;
    }
}

function getTypeColor(type: string) {
    switch (type) {
        case 'flag_review':
            return 'text-error';
        case 'battle_card':
            return 'text-primary';
        case 'scenario':
            return 'text-info';
        default:
            return 'text-base-content/60';
    }
}

function CompletedTrainingTab() {
    const [, navigate] = useLocation();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedRep, setSelectedRep] = useState<number | 'all'>('all');

    const {
        data: trainingData,
        isPending,
        error,
    } = useQuery({
        queryKey: ['completed-training'],
        queryFn: async () => {
            const response = await ho.vantage.api.training.completed.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch completed training');
            }
            const data = await response.json();
            return data.completedTraining ?? [];
        },
    });

    // Group training by salesperson to create rep tiles
    const repSummaries =
        trainingData?.reduce(
            (acc, item: CompletedTrainingItem) => {
                if (!acc[item.salespersonId]) {
                    acc[item.salespersonId] = {
                        salespersonId: item.salespersonId,
                        repName: item.repName,
                        totalSessions: 0,
                        avgScore: 0,
                        totalAttempts: 0,
                        scores: [],
                    };
                }
                acc[item.salespersonId].totalSessions += 1;
                acc[item.salespersonId].totalAttempts += 1; // Simplified - would need real attempt data
                if (item.score != null) {
                    acc[item.salespersonId].scores.push(item.score);
                }
                return acc;
            },
            {} as Record<
                number,
                {
                    salespersonId: number;
                    repName: string;
                    totalSessions: number;
                    avgScore: number;
                    totalAttempts: number;
                    scores: number[];
                }
            >,
        ) ?? {};

    // Calculate average scores
    Object.values(repSummaries).forEach((rep) => {
        if (rep.scores.length > 0) {
            rep.avgScore = rep.scores.reduce((sum, score) => sum + score, 0) / rep.scores.length;
        }
    });

    const filteredTraining =
        trainingData?.filter((item: CompletedTrainingItem) => {
            const matchesSearch =
                item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.repName?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesType = selectedType === 'all' || item.type === selectedType;
            const matchesRep = selectedRep === 'all' || item.salespersonId === selectedRep;
            return matchesSearch && matchesType && matchesRep;
        }) ?? [];

    // Calculate type stats
    const typeStats = {
        flag_review: trainingData?.filter((t: CompletedTrainingItem) => t.type === 'flag_review').length ?? 0,
        battle_card: trainingData?.filter((t: CompletedTrainingItem) => t.type === 'battle_card').length ?? 0,
        scenario: trainingData?.filter((t: CompletedTrainingItem) => t.type === 'scenario').length ?? 0,
    };

    if (isPending) {
        return (
            <div className="flex justify-center items-center h-64">
                <span className="loading loading-spinner loading-lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-error">
                <span>Error loading training: {error.message}</span>
            </div>
        );
    }

    const getScoreColor = (score: number) => {
        if (score >= 8) return 'text-success';
        if (score >= 6) return 'text-warning';
        return 'text-error';
    };

    return (
        <div className="space-y-6">
            {/* Rep Performance Tiles */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Rep Performance Overview</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {Object.values(repSummaries).map((rep) => (
                        <button
                            type="button"
                            key={rep.salespersonId}
                            onClick={() => setSelectedRep(selectedRep === rep.salespersonId ? 'all' : rep.salespersonId)}
                            className={`card bg-base-200 border cursor-pointer transition-all hover:shadow-md ${
                                selectedRep === rep.salespersonId ? 'ring-2 ring-primary border-primary' : 'border-base-content/20'
                            }`}
                        >
                            <div className="card-body p-4 text-center">
                                <div className="avatar placeholder mb-2">
                                    <div className="bg-primary text-primary-content rounded-full w-12">
                                        <span className="text-lg">
                                            {rep.repName
                                                .split(' ')
                                                .map((n) => n[0])
                                                .join('')}
                                        </span>
                                    </div>
                                </div>
                                <div className="font-medium text-sm truncate">{rep.repName}</div>
                                <div className={`text-2xl font-bold ${getScoreColor(rep.avgScore)}`}>{rep.avgScore.toFixed(1)}</div>
                                <div className="text-xs text-base-content/60">{rep.totalSessions} sessions</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Training Type Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                    type="button"
                    onClick={() => setSelectedType(selectedType === 'flag_review' ? 'all' : 'flag_review')}
                    className={`card bg-base-200 border border-base-content/30 cursor-pointer transition-all hover:shadow-md ${
                        selectedType === 'flag_review' ? 'ring-2 ring-primary' : 'border-base-300'
                    }`}
                >
                    <div className="card-body p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-error/10 rounded-lg">
                                    <FlagIcon className="w-5 h-5 text-error" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-sm">Training Flags</div>
                                    <div className="text-xs text-base-content/60">{typeStats.flag_review} sessions</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setSelectedType(selectedType === 'battle_card' ? 'all' : 'battle_card')}
                    className={`card bg-base-200 border border-base-content/30 cursor-pointer transition-all hover:shadow-md ${
                        selectedType === 'battle_card' ? 'ring-2 ring-primary' : 'border-base-300'
                    }`}
                >
                    <div className="card-body p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Target className="w-5 h-5 text-primary" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-sm">Battle Cards</div>
                                    <div className="text-xs text-base-content/60">{typeStats.battle_card} sessions</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setSelectedType(selectedType === 'scenario' ? 'all' : 'scenario')}
                    className={`card bg-base-200 border border-base-content/30 cursor-pointer transition-all hover:shadow-md ${
                        selectedType === 'scenario' ? 'ring-2 ring-primary' : 'border-base-300'
                    }`}
                >
                    <div className="card-body p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-info/10 rounded-lg">
                                    <GraduationCap className="w-5 h-5 text-info" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-sm">Skill Training</div>
                                    <div className="text-xs text-base-content/60">{typeStats.scenario} sessions</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </button>
            </div>

            {/* Filters */}
            <div className="bg-base-200 rounded-lg p-4 border border-base-content/20">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="relative flex-1 min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search training sessions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input input-bordered w-full pl-10"
                        />
                    </div>
                    {(selectedType !== 'all' || selectedRep !== 'all') && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                setSelectedType('all');
                                setSelectedRep('all');
                            }}
                        >
                            Clear Filters
                        </button>
                    )}
                    <div className="badge badge-outline badge-lg">{filteredTraining.length} sessions</div>
                </div>
            </div>

            {/* Training Sessions List */}
            <Card>
                <CardHeader>
                    <CardTitle>Completed Training Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredTraining.length > 0 ? (
                        filteredTraining.map((session: CompletedTrainingItem) => {
                            const IconComponent = getTypeIcon(session.type);
                            const iconColor = getTypeColor(session.type);
                            const formatDuration = (seconds: number) => {
                                const mins = Math.floor(seconds / 60);
                                const secs = seconds % 60;
                                return `${mins}:${secs.toString().padStart(2, '0')}`;
                            };
                            const getScoreBadgeClass = (score: number) => {
                                if (score >= 8) return 'badge-success';
                                if (score >= 6) return 'badge-warning';
                                return 'badge-error';
                            };

                            // Navigate to the proper detail page based on training type
                            const handleClick = () => {
                                if (session.type === 'flag_review' && session.id.startsWith('flag-')) {
                                    const flagId = session.id.replace('flag-', '');
                                    navigate(`/training-flag/${flagId}`);
                                } else if (session.type === 'scenario' || session.type === 'battle_card') {
                                    // Navigate to the scenario training session page with ?review=true to show completed view
                                    if (session.scenarioId) {
                                        navigate(`/salesperson/${session.salespersonId}/training/${session.scenarioId}?review=true`);
                                    }
                                }
                            };

                            // All training items are now clickable
                            const isClickable = true;

                            return (
                                <button
                                    type="button"
                                    key={session.id}
                                    onClick={handleClick}
                                    disabled={!isClickable}
                                    className={`w-full text-left p-4 transition-colors border-b border-base-300 last:border-b-0 ${
                                        isClickable ? 'hover:bg-base-200/50 cursor-pointer' : 'cursor-default'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <IconComponent className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-medium truncate">{session.title}</h3>
                                                <p className="text-sm text-base-content/60">
                                                    {session.repName} {session.description && `• ${session.description}`}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            {/* Score display */}
                                            {session.score != null && (
                                                <div className="text-center">
                                                    <div className={`badge ${getScoreBadgeClass(session.score)} badge-sm`}>
                                                        {session.score.toFixed(1)}/10
                                                    </div>
                                                </div>
                                            )}
                                            {/* Duration display */}
                                            {session.duration != null && (
                                                <div className="flex items-center gap-1 text-sm text-base-content/60">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDuration(session.duration)}
                                                </div>
                                            )}
                                            <div className="text-right">
                                                <div className="text-sm font-medium">
                                                    {session.completedAt ? formatDateShort(session.completedAt) : 'Unknown'}
                                                </div>
                                                <div className="text-xs text-base-content/60">Completed</div>
                                            </div>
                                            <span className="badge badge-success badge-sm">Complete</span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="text-center py-12 text-base-content/60">
                            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <h3 className="font-medium mb-2">No completed training</h3>
                            <p className="text-sm">
                                {searchQuery || selectedType !== 'all'
                                    ? 'Try adjusting your search or filter'
                                    : 'Completed training sessions will appear here'}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function AnalyticsTab() {
    const { data: callsData } = useQuery({
        queryKey: ['all-calls'],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople.allCalls.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch calls');
            }
            const data = await response.json();
            return data.interactions ?? [];
        },
    });

    const { data: trainingData } = useQuery({
        queryKey: ['completed-training'],
        queryFn: async () => {
            const response = await ho.vantage.api.training.completed.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch completed training');
            }
            const data = await response.json();
            return data.completedTraining ?? [];
        },
    });

    const totalCalls = callsData?.length ?? 0;
    const totalTraining = trainingData?.length ?? 0;
    const processedCalls = callsData?.filter((c: Call) => c.processedStatus === 'processed').length ?? 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="card-body">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-primary/10 rounded-lg">
                                <Phone className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold">{totalCalls}</div>
                                <div className="text-sm text-base-content/60">Total Calls</div>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="card-body">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-success/10 rounded-lg">
                                <CheckCircle className="w-6 h-6 text-success" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold">{processedCalls}</div>
                                <div className="text-sm text-base-content/60">Processed</div>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="card-body">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-info/10 rounded-lg">
                                <Trophy className="w-6 h-6 text-info" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold">{totalTraining}</div>
                                <div className="text-sm text-base-content/60">Training Completed</div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            <Card>
                <div className="card-body">
                    <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                            <Users className="w-5 h-5 text-base-content/60" />
                            <div>
                                <div className="font-medium">Active Reps</div>
                                <div className="text-sm text-base-content/60">Across all teams</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-base-content/60" />
                            <div>
                                <div className="font-medium">Avg. Call Duration</div>
                                <div className="text-sm text-base-content/60">Coming soon</div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}

export function CallLibraryPage() {
    // Parse initial tab from URL query params
    const getInitialTab = (): 'calls' | 'training' | 'analytics' => {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        if (tabParam === 'training') return 'training';
        if (tabParam === 'analytics') return 'analytics';
        return 'calls';
    };

    const [activeTab, setActiveTab] = useState<'calls' | 'training' | 'analytics'>(getInitialTab);

    return (
        <PageContainer>
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Call Library</h1>
                <p className="text-base-content/70 mt-1">Browse call recordings and training sessions</p>
            </div>

            {/* Tabs */}
            <div role="tablist" className="tabs tabs-boxed bg-base-200 w-fit">
                <button
                    type="button"
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'calls' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('calls')}
                >
                    <Phone className="w-4 h-4" />
                    Call Recordings
                </button>
                <button
                    type="button"
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'training' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('training')}
                >
                    <CheckCircle className="w-4 h-4" />
                    Completed Training
                </button>
                <button
                    type="button"
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'analytics' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                >
                    <TrendingUp className="w-4 h-4" />
                    Analytics
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'calls' && <CallRecordingsTab />}
            {activeTab === 'training' && <CompletedTrainingTab />}
            {activeTab === 'analytics' && <AnalyticsTab />}
        </PageContainer>
    );
}
