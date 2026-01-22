import { useCompletedTraining, type CompletedTrainingItem } from '#data/training';
import { formatTimeAgo } from '#util';
import { BookOpen, Clock, Star, Flag, Target, Play, Eye } from 'lucide-react';
import { useLocation } from 'wouter';

interface CompletedTrainingListProps {
    salespersonId: number;
}

function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getScoreColorClass(score: number | null | undefined): string {
    if (score == null) return 'bg-base-300 text-base-content';
    if (score >= 8.5) return 'bg-success/20 text-success border-success/30';
    if (score >= 7.0) return 'bg-warning/20 text-warning border-warning/30';
    return 'bg-error/20 text-error border-error/30';
}

function getSeverityBorderClass(score: number | null | undefined): string {
    if (score == null) return 'border-l-base-300';
    if (score >= 8.5) return 'border-l-success';
    if (score >= 7.0) return 'border-l-warning';
    return 'border-l-error';
}

function getTypeIcon(type: string) {
    switch (type) {
        case 'flag_review':
            return <Flag className="h-4 w-4" />;
        case 'battle_card':
            return <Target className="h-4 w-4" />;
        case 'scenario':
        default:
            return <BookOpen className="h-4 w-4" />;
    }
}

function getTypeLabel(type: string): string {
    switch (type) {
        case 'flag_review':
            return 'Flag Training';
        case 'battle_card':
            return 'Battle Card';
        case 'scenario':
            return 'Skills Training';
        default:
            return 'Training';
    }
}

export function CompletedTrainingList({ salespersonId }: CompletedTrainingListProps) {
    const { data, isPending, error } = useCompletedTraining(salespersonId);
    const [, navigate] = useLocation();

    const handleReviewClick = (session: CompletedTrainingItem) => {
        // Navigate based on type and available data
        if ((session.type === 'scenario' || session.type === 'battle_card') && session.scenarioId) {
            // Build query params for the specific session
            const params = new URLSearchParams({ review: 'true' });
            if (session.conversationId) {
                params.set('conversationId', session.conversationId);
            }
            if (session.score != null) {
                params.set('score', session.score.toString());
            }
            if (session.duration != null) {
                params.set('duration', session.duration.toString());
            }
            if (session.completedAt) {
                params.set('completedAt', session.completedAt);
            }
            navigate(`/salesperson/${salespersonId}/training/${session.scenarioId}?${params.toString()}`);
        } else if (session.type === 'flag_review') {
            // Extract flag ID from the id field (format: "flag-123")
            const flagId = session.id.replace('flag-', '');
            navigate(`/training-flag/${flagId}`);
        }
    };

    if (isPending) {
        return (
            <div className="flex justify-center items-center py-8">
                <span className="loading loading-spinner loading-md"></span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-error">
                <span>Failed to load completed training</span>
            </div>
        );
    }

    const completedTraining = data?.completedTraining ?? [];

    if (completedTraining.length === 0) {
        return (
            <div className="text-center py-8 border border-dashed border-base-300 rounded-lg">
                <BookOpen className="h-10 w-10 mx-auto text-base-content/30 mb-3" />
                <h3 className="font-medium mb-1">No Completed Training</h3>
                <p className="text-sm text-base-content/60">Completed training sessions will appear here</p>
            </div>
        );
    }

    // Calculate stats
    const sessionsWithScores = completedTraining.filter((s: CompletedTrainingItem) => s.score != null);
    const averageScore =
        sessionsWithScores.length > 0
            ? sessionsWithScores.reduce((acc: number, s: CompletedTrainingItem) => acc + (s.score ?? 0), 0) / sessionsWithScores.length
            : null;
    const highPerforming = completedTraining.filter((s: CompletedTrainingItem) => s.score != null && s.score >= 8.5);
    const needsImprovement = completedTraining.filter((s: CompletedTrainingItem) => s.score != null && s.score < 7.0);

    return (
        <div className="space-y-4">
            {/* Stats Header */}
            <div className="grid grid-cols-4 gap-3 text-center p-3 bg-base-200 rounded-lg">
                <div>
                    <div className="text-xl font-bold text-primary">{completedTraining.length}</div>
                    <div className="text-xs text-base-content/70">Total</div>
                </div>
                <div>
                    <div className="text-xl font-bold flex items-center justify-center gap-1">
                        <Star className="h-4 w-4 text-warning" />
                        {averageScore != null ? averageScore.toFixed(1) : '--'}
                    </div>
                    <div className="text-xs text-base-content/70">Avg Score</div>
                </div>
                <div>
                    <div className="text-xl font-bold text-success">{highPerforming.length}</div>
                    <div className="text-xs text-base-content/70">High Perf.</div>
                </div>
                <div>
                    <div className="text-xl font-bold text-error">{needsImprovement.length}</div>
                    <div className="text-xs text-base-content/70">Needs Work</div>
                </div>
            </div>

            {/* Training Sessions List */}
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {completedTraining.map((session: CompletedTrainingItem) => (
                    <div
                        key={session.id}
                        className={`border-l-4 ${getSeverityBorderClass(session.score)} bg-base-100 rounded-lg p-4 hover:bg-accent/30 transition-colors cursor-pointer border border-base-300`}
                        onClick={() => handleReviewClick(session)}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                {/* Title Row */}
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-base-content/60">{getTypeIcon(session.type)}</span>
                                    <h4 className="font-semibold text-sm truncate">{session.title}</h4>
                                </div>

                                {/* Meta Row */}
                                <div className="flex items-center gap-3 text-xs text-base-content/60 flex-wrap">
                                    <span className="badge badge-ghost badge-sm">{getTypeLabel(session.type)}</span>
                                    {session.completedAt && (
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatTimeAgo(session.completedAt)}
                                        </span>
                                    )}
                                    {session.duration != null && (
                                        <span className="flex items-center gap-1">
                                            <Play className="h-3 w-3" />
                                            {formatDuration(session.duration)}
                                        </span>
                                    )}
                                </div>

                                {/* Description */}
                                {session.description && (
                                    <p className="text-xs text-base-content/50 mt-2 line-clamp-1">{session.description}</p>
                                )}
                            </div>

                            {/* Score Badge & Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {session.score != null && (
                                    <div className={`px-3 py-1.5 rounded-lg font-bold text-sm border ${getScoreColorClass(session.score)}`}>
                                        {session.score.toFixed(1)}/10
                                    </div>
                                )}
                                <button className="btn btn-ghost btn-sm btn-square">
                                    <Eye className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
