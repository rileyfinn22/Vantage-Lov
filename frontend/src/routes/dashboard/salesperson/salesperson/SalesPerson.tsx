import { useCallback, useState } from 'react';
import { tw } from '#util/tw';
import { formatDate, formatCurrency, getProgressColor, getRatingBadgeClass, formatTimeAgo } from '#util';
import { getBriefFlagTitle } from '#util/flags';
import { useLocation } from 'wouter';
import { useSalesPersonData } from '#data/fetchers.ts';
import { usePaginatedFlags } from '#data/flags';
import { useTrainingAssignments, type TrainingAssignment } from '#data/training-assignments';
import { useStartBattleCardTraining } from '#data/battle-cards';
import { SkillsRatings } from '../../components/SkillsRatings';
import { SkillsTrendsChart } from '../../components/SkillsTrendsChart';
import { Play, Pause, Flag as FlagIcon, Target, ArrowLeft, Clock, CheckCircle2, ChevronRight, BookOpen } from 'lucide-react';
import { CompletedTrainingList } from '../components/CompletedTrainingList';

const PageContainer = tw.div`space-y-6`;
const Section = tw.div`bg-base-200 rounded-lg border border-base-content/30 shadow-sm p-6`;
const SectionHeader = tw.h2`text-lg font-semibold mb-4`;
const ThreeColumnGrid = tw.div`grid grid-cols-1 lg:grid-cols-3 gap-6`;

const Badge = tw.span`px-2 py-1 text-xs font-medium rounded`;

// Metrics Components
const MetricsGrid = tw.div`grid grid-cols-2 gap-4 text-sm`;
const MetricItem = tw.div``;
const MetricLabel = tw.div`text-base-content/70 text-xs`;
const MetricValue = tw.div`font-semibold`;

// Progress Components
const ProgressSection = tw.div`space-y-3`;
const ProgressHeader = tw.div`flex justify-between text-sm`;
const ProgressBar = tw.div`h-2 bg-base-200 rounded-full overflow-hidden`;
const ProgressFill = tw.div`h-full transition-all duration-300`;
const ProgressLabel = tw.div`text-xs text-base-content/70`;

// Ratings Components
const RatingsList = tw.div`space-y-3`;
const RatingItem = tw.div`flex items-center justify-between p-3 border border-base-300 rounded-lg`;
const RatingInfo = tw.div`flex items-center space-x-2`;
const InteractionTime = tw.time`text-sm text-base-content/60`;

/**
 * Type representing a training flag
 */
type TrainingFlag = {
    id: number;
    complete: boolean;
    source?: string;
    createdAt: string | null;
    flagData?: {
        flag_title?: string;
    } | null;
    reason?: string | null;
    prospectName?: string | null;
    prospectCompany?: string | null;
};

export function Salesperson({ id }: { id: string }) {
    const { data, isPending: loading, error } = useSalesPersonData(id);
    const [, navigate] = useLocation();
    const [playingClips, setPlayingClips] = useState<Set<number>>(new Set());

    // Use paginated flags
    const {
        data: flagsData,
        goToNextPage,
        goToPreviousPage,
        hasNextPage,
        hasPreviousPage,
        isLoading: isLoadingFlags,
    } = usePaginatedFlags(id, 5);

    // Use training assignments
    const { data: assignmentsData, isPending: isLoadingAssignments } = useTrainingAssignments(id);

    // Filter for battle card assignments only
    const battleCardAssignments =
        assignmentsData?.filter((a: TrainingAssignment) => a.trainingType === 'battle_card' && a.status !== 'completed') ?? [];

    // Hook to start battle card training (generates scenario if needed)
    const { mutate: startBattleCardTraining, isPending: isStartingTraining } = useStartBattleCardTraining();

    const handleStartBattleCardTraining = useCallback(
        (battleCardId: string) => {
            const numericId = parseInt(battleCardId, 10);
            if (isNaN(numericId)) return;

            startBattleCardTraining(numericId, {
                onSuccess: (data) => {
                    if (data.scenario) {
                        navigate(`/salesperson/${id}/training/${data.scenario.id}`);
                    }
                },
            });
        },
        [startBattleCardTraining, navigate, id],
    );

    const handleFlagClick = useCallback(
        (flagId: number) => {
            navigate(`/training-flag/${flagId}`);
        },
        [navigate],
    );

    const toggleClip = useCallback((flagId: number) => {
        setPlayingClips((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(flagId)) {
                newSet.delete(flagId);
            } else {
                newSet.add(flagId);
                // Auto stop after 3 seconds (simulate clip length)
                setTimeout(() => {
                    setPlayingClips((current) => {
                        const updated = new Set(current);
                        updated.delete(flagId);
                        return updated;
                    });
                }, 3000);
            }
            return newSet;
        });
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (error ?? !data) {
        return (
            <div className="alert alert-error">
                <span>Error loading salesperson data: {error?.message ?? 'Not found'}</span>
            </div>
        );
    }

    const { salesperson, company, avgScore, revenueMetrics } = data;

    // Get current page data
    const currentFlags = flagsData?.flags ?? [];
    const currentPagination = flagsData?.pagination;

    // Calculate metrics for badges and progress
    const avgRating = avgScore;
    const incompleteFlags = currentFlags?.filter((flag: TrainingFlag) => !flag.complete) ?? [];
    const totalIncompleteFlags = currentPagination?.total ?? incompleteFlags.length;
    const pendingBattleCards = battleCardAssignments?.length ?? 0;
    const pendingTasksCount = totalIncompleteFlags + pendingBattleCards;
    const monthlyProgress = revenueMetrics?.monthlyQuota > 0 ? (revenueMetrics.mtdClosed / revenueMetrics.monthlyQuota) * 100 : 0;
    const quarterlyProgress = revenueMetrics?.quarterlyQuota > 0 ? (revenueMetrics.qtdClosed / revenueMetrics.quarterlyQuota) * 100 : 0;

    return (
        <PageContainer>
            {/* Back Button */}
            <div className="mb-4">
                <button onClick={() => window.history.back()} className="btn btn-ghost btn-sm gap-1 hover:bg-base-200" aria-label="Go back">
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Dashboard</span>
                </button>
            </div>

            {/* Header Section */}
            <div className="border-b border-base-300 pb-6">
                <div className="flex items-center gap-6">
                    {/* Avatar with ring styling */}
                    <div className="avatar">
                        <div className="w-16 h-16 rounded-full ring-2 ring-primary/20 ring-offset-2 ring-offset-base-100">
                            {salesperson.avatar ? (
                                <img src={salesperson.avatar} alt={`${salesperson.firstName} ${salesperson.lastName}`} />
                            ) : (
                                <div className="bg-primary/10 text-primary flex items-center justify-center w-full h-full text-xl font-bold">
                                    {salesperson.firstName?.[0]}
                                    {salesperson.lastName?.[0]}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-3xl font-bold">
                                {salesperson.firstName} {salesperson.lastName}
                            </h1>
                            {pendingTasksCount > 0 ? (
                                <div className="flex items-center gap-2">
                                    {totalIncompleteFlags > 0 && (
                                        <div className="flex items-center gap-1 px-2 py-1 bg-error/10 text-error rounded-full text-xs font-medium">
                                            <FlagIcon className="h-3 w-3" />
                                            <span>{totalIncompleteFlags} pending</span>
                                        </div>
                                    )}
                                    {pendingBattleCards > 0 && (
                                        <div className="flex items-center gap-1 px-2 py-1 bg-warning/10 text-warning rounded-full text-xs font-medium">
                                            <Target className="h-3 w-3" />
                                            <span>{pendingBattleCards} pending</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 px-2 py-1 bg-success/10 text-success rounded-full text-xs font-medium">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>All complete</span>
                                </div>
                            )}
                        </div>
                        <p className="text-base-content/70">{company ? `Sales Rep at ${company.name}` : 'Sales Rep'}</p>
                    </div>

                    {/* Prominent Vantage Score with background */}
                    <div className="text-center p-4 bg-primary/5 rounded-xl border border-primary/10">
                        <div className="text-5xl font-black text-primary">{avgRating}</div>
                        <div className="text-sm text-base-content/70 font-medium">Vantage Score</div>
                    </div>
                </div>
            </div>

            {/* Training Tasks & Skills - 3 Column Layout */}
            <ThreeColumnGrid>
                {/* Left Side - Training Tasks & Battle Cards - Takes up 2 columns */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Flag Training Tasks */}
                    <Section>
                        <SectionHeader className="flex items-center gap-2">
                            <FlagIcon className="h-5 w-5 text-error" />
                            Flag Training
                            {totalIncompleteFlags > 0 && <span className="badge badge-error">{totalIncompleteFlags} Active</span>}
                        </SectionHeader>

                        <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2">
                            {incompleteFlags.map((flag: TrainingFlag, index: number) => {
                                return (
                                    <div
                                        key={flag.id}
                                        className="rounded-lg p-4 border border-primary transition-all duration-200 cursor-pointer group animate-fade-in-up hover:bg-accent/50"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                        onClick={() => handleFlagClick(flag.id)}
                                    >
                                        <div className="flex gap-4">
                                            {/* Video Preview - Left Side */}
                                            <div className="flex-shrink-0">
                                                <div className="w-48 h-32 bg-base-300 rounded-lg flex items-center justify-center relative overflow-hidden">
                                                    <button
                                                        className="btn btn-lg btn-circle bg-base-100/90 hover:bg-base-100 z-10 border-none shadow-md"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleClip(flag.id);
                                                        }}
                                                    >
                                                        {playingClips.has(flag.id) ? (
                                                            <Pause className="h-5 w-5" />
                                                        ) : (
                                                            <Play className="h-5 w-5 ml-0.5" />
                                                        )}
                                                    </button>

                                                    <div className="absolute bottom-2 right-2 bg-base-content/80 text-base-100 text-xs px-1.5 py-0.5 rounded">
                                                        0:00
                                                    </div>
                                                </div>

                                                <div className="mt-2">
                                                    <progress
                                                        className="progress progress-primary h-1 w-full"
                                                        value="0"
                                                        max="100"
                                                    ></progress>
                                                    <div className="flex justify-between text-xs text-base-content/70 mt-1">
                                                        <span>0:00</span>
                                                        <span>0:00</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Flag Details - Right Side */}
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        {/* Prospect Name @ Company */}
                                                        {(flag.prospectName ?? flag.prospectCompany) && (
                                                            <div className="text-xs font-semibold text-base-content/60 mb-1">
                                                                {flag.prospectName && flag.prospectCompany
                                                                    ? `${flag.prospectName} @ ${flag.prospectCompany}`
                                                                    : (flag.prospectName ?? flag.prospectCompany)}
                                                            </div>
                                                        )}
                                                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors duration-200">
                                                            {getBriefFlagTitle(flag)}
                                                        </h3>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm btn-ghost border border-base-300"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleFlagClick(flag.id);
                                                        }}
                                                    >
                                                        <Play className="h-3 w-3" />
                                                        {!flag.complete ? 'Start Training' : 'Review'}
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2 text-sm text-base-content/70">
                                                    {flag.createdAt && (
                                                        <span className="flex items-center gap-1 text-xs">
                                                            <Clock className="h-3 w-3" />
                                                            {formatTimeAgo(flag.createdAt)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {incompleteFlags.length === 0 && (
                                <div className="text-center py-8 bg-success/5 rounded-lg border border-success/20">
                                    <div className="text-success mb-3">
                                        <CheckCircle2 className="h-10 w-10 mx-auto" />
                                    </div>
                                    <h3 className="font-medium mb-1 text-success">No Flag Training</h3>
                                    <p className="text-sm text-base-content/60">No active flag training tasks</p>
                                </div>
                            )}
                        </div>

                        {/* Pagination */}
                        {currentPagination && currentPagination.totalPages > 1 && (
                            <div className="flex justify-center items-center gap-2 pt-4">
                                <div className="join">
                                    <button
                                        className="join-item btn btn-sm"
                                        onClick={goToPreviousPage}
                                        disabled={currentPagination.page <= 1 || isLoadingFlags}
                                    >
                                        Previous
                                    </button>
                                    <div className="join-item btn btn-sm btn-ghost no-animation cursor-default">
                                        Page {currentPagination.page} of {currentPagination.totalPages}
                                    </div>
                                    <button
                                        className="join-item btn btn-sm"
                                        onClick={goToNextPage}
                                        disabled={currentPagination.page >= currentPagination.totalPages || isLoadingFlags}
                                    >
                                        Next
                                    </button>
                                </div>
                                {isLoadingFlags && <span className="loading loading-spinner loading-sm"></span>}
                            </div>
                        )}
                    </Section>

                    {/* Battle Card Training - under flags */}
                    <Section>
                        <SectionHeader className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-warning" />
                            Battle Card Training
                            {battleCardAssignments.length > 0 && (
                                <span className="badge badge-warning">{battleCardAssignments.length} Assigned</span>
                            )}
                        </SectionHeader>

                        {isLoadingAssignments || isStartingTraining ? (
                            <div className="flex justify-center items-center py-8">
                                <span className="loading loading-spinner loading-md"></span>
                                {isStartingTraining && <span className="ml-2 text-sm">Starting training...</span>}
                            </div>
                        ) : battleCardAssignments.length > 0 ? (
                            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                                {battleCardAssignments.map((assignment: TrainingAssignment, index: number) => {
                                    const isUrgent = assignment.priority === 'high';
                                    const displayTitle = assignment.title.replace(/^Battle Card:\s*/i, '');

                                    return (
                                        <div
                                            key={assignment.id}
                                            className="border border-warning/30 rounded-lg p-4 hover:border-warning hover:bg-accent/50 hover:shadow-md transition-all duration-200 cursor-pointer group animate-fade-in"
                                            style={{ animationDelay: `${index * 50}ms` }}
                                            onClick={() => {
                                                if (assignment.trainingId) {
                                                    handleStartBattleCardTraining(assignment.trainingId);
                                                }
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Target className="h-4 w-4 text-warning transition-transform duration-200 group-hover:scale-110" />
                                                        <h4 className="font-medium text-sm group-hover:text-primary transition-colors duration-200">
                                                            {displayTitle}
                                                        </h4>
                                                        {isUrgent && <span className="badge badge-xs badge-error">urgent</span>}
                                                    </div>
                                                    {assignment.description && (
                                                        <p className="text-xs text-base-content/70 mb-1 line-clamp-1">
                                                            {assignment.description}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-3 text-xs text-base-content/60">
                                                        {assignment.createdAt && <span>{formatTimeAgo(assignment.createdAt)}</span>}
                                                    </div>
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-base-content/50 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8 border border-dashed border-base-300 rounded-lg">
                                <Target className="h-10 w-10 mx-auto text-base-content/30 mb-3" />
                                <h3 className="font-medium mb-1">No Battle Card Assignments</h3>
                                <p className="text-sm text-base-content/60">Battle cards will appear here when assigned</p>
                            </div>
                        )}
                    </Section>

                    {/* Completed Training Sessions */}
                    <Section>
                        <SectionHeader className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-success" />
                            Completed Training
                        </SectionHeader>
                        <CompletedTrainingList salespersonId={parseInt(id, 10)} />
                    </Section>
                </div>

                {/* Right Side - Skills Assessment & Trends - Takes up 1 column */}
                <div className="lg:col-span-1 space-y-4">
                    <SkillsRatings salespersonId={id} repName={`${salesperson.firstName} ${salesperson.lastName}`} />
                    <SkillsTrendsChart salespersonId={id} repName={`${salesperson.firstName} ${salesperson.lastName}`} compact />
                </div>
            </ThreeColumnGrid>

            {/* Performance Metrics */}
            {revenueMetrics && (
                <Section>
                    <SectionHeader>Performance Metrics</SectionHeader>

                    {/* Financial Metrics Grid */}
                    <MetricsGrid>
                        <MetricItem>
                            <MetricLabel>MTD Closed</MetricLabel>
                            <MetricValue>{formatCurrency(revenueMetrics.mtdClosed)}</MetricValue>
                        </MetricItem>
                        <MetricItem>
                            <MetricLabel>QTD Closed</MetricLabel>
                            <MetricValue>{formatCurrency(revenueMetrics.qtdClosed)}</MetricValue>
                        </MetricItem>
                    </MetricsGrid>

                    {/* Progress Section */}
                    <ProgressSection>
                        <ProgressHeader>
                            <span className="text-base-content/70">Monthly Progress</span>
                            <span className="font-medium">{monthlyProgress.toFixed(0)}%</span>
                        </ProgressHeader>
                        <ProgressBar>
                            <ProgressFill
                                className={getProgressColor(monthlyProgress)}
                                style={{ width: `${Math.min(monthlyProgress, 100)}%` }}
                            />
                        </ProgressBar>
                        <ProgressLabel>
                            {formatCurrency(revenueMetrics.mtdClosed)} of {formatCurrency(revenueMetrics.monthlyQuota)} monthly quota
                        </ProgressLabel>

                        <div className="text-xs text-base-content/70 bg-base-200 rounded p-2">
                            <div className="flex justify-between">
                                <span>Quarterly: {quarterlyProgress.toFixed(0)}%</span>
                                <span>
                                    {formatCurrency(revenueMetrics.qtdClosed)} / {formatCurrency(revenueMetrics.quarterlyQuota)}
                                </span>
                            </div>
                        </div>
                    </ProgressSection>
                </Section>
            )}
        </PageContainer>
    );
}
