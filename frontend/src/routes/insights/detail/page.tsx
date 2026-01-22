import { useParams } from 'wouter';
import { useInsightItem } from '#data/insights';
import { useBattleCardForSource, useBattleCard, useStartBattleCardTraining } from '#data/battle-cards';
import { EditableBattleCard } from '../components/EditableBattleCard';
import { AssignToTeamDropdown } from '../components/AssignToTeamDropdown';
import { TrendingUp, TrendingDown, ArrowLeft, PlayCircle, Target, Users, Phone, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useMe } from '#util/useMe';
import { useIsManager } from '#util/useRole';

export function InsightDetailPage() {
    const params = useParams<{ itemType: string; itemId: string }>();
    const [, navigate] = useLocation();
    const { salesData } = useMe();
    const isManager = useIsManager();
    const itemType = params.itemType as 'objection' | 'prospect-pain' | 'rep-pain';
    const itemId = params.itemId ?? '';

    const { data: item, callStats, isPending: itemLoading, error: itemError } = useInsightItem(itemType, itemId);

    // Determine source type for battle card lookup
    const sourceType = itemType === 'objection' ? 'objection' : 'pain_point';
    const sourceId = parseInt(itemId, 10);

    const {
        data: battleCardFromList,
        isPending: battleCardListLoading,
        error: battleCardError,
    } = useBattleCardForSource(sourceType, sourceId);

    // Once we have the battle card ID, fetch it with the scenario data
    const { data: battleCardWithScenario, isPending: battleCardDetailLoading } = useBattleCard(battleCardFromList?.id ?? 0);

    const battleCard = battleCardWithScenario?.battleCard ?? battleCardFromList;
    const scenario = battleCardWithScenario?.scenario;
    const battleCardLoading = battleCardListLoading || (battleCardFromList && battleCardDetailLoading);

    const { mutate: startTraining, isPending: isStartingTraining } = useStartBattleCardTraining();

    const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
        switch (trend) {
            case 'up':
                return <TrendingUp className="w-4 h-4 text-error" />;
            case 'down':
                return <TrendingDown className="w-4 h-4 text-success" />;
            case 'stable':
                return <div className="w-4 h-4 border rounded bg-base-300" />;
        }
    };

    const getImpactBadge = (impact: 'high' | 'medium' | 'low') => {
        switch (impact) {
            case 'high':
                return 'badge-error';
            case 'medium':
                return 'badge-warning';
            case 'low':
                return 'badge-ghost';
        }
    };

    const getSeverityBadge = (severity: 'critical' | 'major' | 'minor') => {
        switch (severity) {
            case 'critical':
                return 'badge-error';
            case 'major':
                return 'badge-warning';
            case 'minor':
                return 'badge-ghost';
        }
    };

    const getOvercomeColor = (percentage: number) => {
        if (percentage >= 70) return 'text-success bg-success/10';
        if (percentage >= 50) return 'text-warning bg-warning/10';
        return 'text-error bg-error/10';
    };

    const handleStartTraining = () => {
        if (!battleCard) return;

        const salespersonId = salesData?.salesperson?.id ?? 1;

        // If scenario already exists, navigate directly
        if (scenario) {
            navigate(`/salesperson/${salespersonId}/training/${scenario.id}`);
            return;
        }

        // Otherwise, call the train API to generate a scenario
        startTraining(battleCard.id, {
            onSuccess: (data) => {
                if (data.scenario) {
                    navigate(`/salesperson/${salespersonId}/training/${data.scenario.id}`);
                }
            },
        });
    };

    if (itemLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (itemError || !item) {
        return (
            <div className="container mx-auto p-6">
                <button className="btn btn-ghost mb-4" onClick={() => navigate('/insights')}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Insights
                </button>
                <div className="card bg-base-200 border border-base-content/30">
                    <div className="card-body text-center">
                        <p>Item not found</p>
                    </div>
                </div>
            </div>
        );
    }

    const isObjection = itemType === 'objection';
    const isPainPoint = itemType === 'prospect-pain' || itemType === 'rep-pain';
    const overcomeRate = callStats?.overcome_percentage ?? 0;
    const timesMentioned = callStats?.times_mentioned ?? 0;
    const totalCalls = callStats?.total_org_calls ?? 0;

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Back Button */}
            <div className="flex items-center justify-between">
                <button className="btn btn-ghost" onClick={() => navigate('/insights')}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Insights
                </button>
            </div>

            {/* Header Card with Gradient */}
            <div className="card bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
                <div className="card-body">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-bold">{item.title}</h1>
                                {isObjection && 'trend' in item && getTrendIcon(item.trend)}
                                {isObjection && 'impact' in item && (
                                    <span className={`badge ${getImpactBadge(item.impact)}`}>{item.impact} impact</span>
                                )}
                                {isPainPoint && 'severity' in item && (
                                    <span className={`badge ${getSeverityBadge(item.severity)}`}>{item.severity}</span>
                                )}
                            </div>
                            <p className="text-lg text-base-content/70">{item.description}</p>
                            <div className="flex items-center gap-4 text-sm text-base-content/60">
                                <span className="flex items-center gap-1">
                                    <Target className="w-4 h-4" />
                                    {item.phase} phase
                                </span>
                                <span className="flex items-center gap-1">
                                    <Users className="w-4 h-4" />
                                    {item.frequency}% frequency
                                </span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-4xl font-bold text-primary">{item.frequency}%</div>
                            <div className="text-sm text-base-content/60">frequency</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Call Statistics & Overcome Rate */}
                <div className="bg-base-200 rounded-lg border border-base-content/20 shadow-sm">
                    <div className="p-4">
                        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                            <Phone className="w-4 h-4 text-info" />
                            Call Statistics & Overcome Rate
                        </h3>
                        <div className="space-y-4 pt-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-base-content/60">Total Calls</span>
                                        <span className="font-semibold">{totalCalls.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-base-content/60">Mentions</span>
                                        <span className="font-semibold">{timesMentioned.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className={`text-xl font-bold px-2 py-1 rounded ${getOvercomeColor(overcomeRate)}`}>
                                        {Math.round(overcomeRate)}%
                                    </div>
                                    <p className="text-xs text-base-content/60 mt-1">{isObjection ? 'Overcome Rate' : 'Resolution Rate'}</p>
                                </div>
                            </div>
                            <div className="divider my-0"></div>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-base-content/60">{isObjection ? 'Overcome' : 'Resolved'}</span>
                                    <span className="font-semibold text-success">
                                        {Math.round(timesMentioned * (overcomeRate / 100)).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-base-content/60">{isObjection ? 'Not Overcome' : 'Not Resolved'}</span>
                                    <span className="font-semibold text-error">
                                        {Math.round(timesMentioned * ((100 - overcomeRate) / 100)).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Battle Card */}
                <div className="xl:col-span-2 bg-base-200 rounded-lg border border-base-content/20 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Battle Card</h3>
                        <div className="flex gap-2">
                            {isManager && battleCard && (
                                <AssignToTeamDropdown battleCardId={battleCard.id} battleCardTitle={battleCard.title} />
                            )}
                        </div>
                    </div>

                    {battleCardLoading && (
                        <div className="flex justify-center items-center py-8">
                            <span className="loading loading-spinner loading-md"></span>
                            <span className="ml-2 text-base-content/70">Loading battle card...</span>
                        </div>
                    )}

                    {!battleCardLoading && battleCard && (
                        <EditableBattleCard battleCard={battleCard} showPracticeButton={false} canEdit={isManager} />
                    )}

                    {!battleCardLoading && !battleCard && !battleCardError && (
                        <div className="alert alert-info">
                            <span>No battle card available for this item yet.</span>
                        </div>
                    )}

                    {/* Practice Button */}
                    {battleCard && (
                        <div className="flex justify-end mt-4">
                            <button className="btn btn-primary" onClick={handleStartTraining} disabled={isStartingTraining}>
                                {isStartingTraining ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm"></span>
                                        Starting Training...
                                    </>
                                ) : (
                                    <>
                                        <PlayCircle className="w-5 h-5" />
                                        Practice This Scenario
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Additional Info Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Common Successful Approaches */}
                <div className="bg-base-200 rounded-lg border border-base-content/20 shadow-sm">
                    <div className="p-4">
                        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                            <CheckCircle className="w-5 h-5 text-success" />
                            Common Successful Approaches
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <h4 className="font-medium text-sm mb-2">Proven Strategies:</h4>
                                <ul className="space-y-2">
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-primary mt-0.5">•</span>
                                        Acknowledge the concern immediately and thank them for sharing
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-primary mt-0.5">•</span>
                                        Use specific customer examples and case studies
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-primary mt-0.5">•</span>
                                        Provide concrete ROI calculations and timelines
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-primary mt-0.5">•</span>
                                        Offer flexible payment options or pilot programs
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-medium text-sm mb-2">Key Messaging:</h4>
                                <ul className="space-y-2">
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-primary mt-0.5">•</span>
                                        Focus on cost of inaction vs. investment
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-primary mt-0.5">•</span>
                                        Highlight quick wins and immediate value
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Common Mistakes to Avoid */}
                <div className="bg-base-200 rounded-lg border border-base-content/20 shadow-sm">
                    <div className="p-4">
                        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                            <XCircle className="w-5 h-5 text-error" />
                            Common Mistakes to Avoid
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <h4 className="font-medium text-sm mb-2">What NOT to Do:</h4>
                                <ul className="space-y-2">
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-error mt-0.5">•</span>
                                        Don't immediately offer discounts or concessions
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-error mt-0.5">•</span>
                                        Avoid generic responses or one-size-fits-all approaches
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-error mt-0.5">•</span>
                                        Don't dismiss their concerns as invalid
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-error mt-0.5">•</span>
                                        Avoid pressuring for immediate decisions
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-medium text-sm mb-2">Red Flags:</h4>
                                <ul className="space-y-2">
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-error mt-0.5">•</span>
                                        Multiple objections in short timeframe
                                    </li>
                                    <li className="text-sm text-base-content/70 flex items-start gap-2">
                                        <span className="text-error mt-0.5">•</span>
                                        Vague responses about decision-making process
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Trend Analysis */}
            <div className="bg-base-200 rounded-lg border border-base-content/20 shadow-sm">
                <div className="p-4">
                    <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-warning" />
                        Trend Analysis & Recommendations
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <h4 className="font-medium text-sm mb-2">Monthly Trend</h4>
                            <p className="text-sm text-base-content/70">
                                {isObjection && 'trend' in item && item.trend === 'up'
                                    ? 'This objection has increased recently'
                                    : isObjection && 'trend' in item && item.trend === 'down'
                                      ? 'This objection has decreased recently'
                                      : 'This item has remained stable this month'}
                            </p>
                        </div>
                        <div>
                            <h4 className="font-medium text-sm mb-2">Team Performance</h4>
                            <p className="text-sm text-base-content/70">
                                Top performers overcome this at a higher rate compared to the team average of {Math.round(overcomeRate)}%
                            </p>
                        </div>
                        <div>
                            <h4 className="font-medium text-sm mb-2">Recommended Action</h4>
                            <p className="text-sm text-base-content/70">
                                Focus on additional training and role-play exercises for this specific{' '}
                                {isObjection ? 'objection' : 'pain point'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
