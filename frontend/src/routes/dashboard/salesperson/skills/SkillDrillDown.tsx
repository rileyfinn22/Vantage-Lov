import { useRoute, Link } from 'wouter';
import { ArrowLeft, BarChart3, Calendar, TrendingUp, ExternalLink } from 'lucide-react';
import { useSkillCallDetails, useSkillDistribution } from '#data/skills';
import { useSalesPersonData } from '#data/fetchers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SKILL_NAMES: Record<string, string> = {
    objection_handling: 'Objection Handling',
    pricing_discussions: 'Pricing Discussions',
    discovery: 'Discovery & Features',
    closing: 'Closing',
};

const SKILL_COLORS = {
    high: '#10b981', // green
    medium: '#f59e0b', // amber
    low: '#ef4444', // red
};

/**
 * SkillDrillDown Component
 *
 * Detailed view for a specific skill showing:
 * - Score distribution histogram
 * - Call-by-call list with evidence and missed opportunities
 * - Links to original call recordings
 */
export function SkillDrillDown() {
    const [, params] = useRoute('/dashboard/salesperson/:id/skills/:skillKey');
    const salespersonId = params?.id ?? '';
    const skillKey = params?.skillKey as 'objection_handling' | 'pricing_discussions' | 'discovery' | 'closing';

    const { data: salespersonData, isPending: salespersonLoading } = useSalesPersonData(salespersonId);
    const { data: callDetails, isPending: callsLoading } = useSkillCallDetails(salespersonId, skillKey);
    const { data: distribution, isPending: distributionLoading } = useSkillDistribution(salespersonId, skillKey);

    const skillName = SKILL_NAMES[skillKey] || skillKey;
    const repName = salespersonData?.salesperson ? `${salespersonData.salesperson.firstName} ${salespersonData.salesperson.lastName}` : '';

    // Helper to get score color
    const getScoreColor = (score: number) => {
        if (score >= 8) return SKILL_COLORS.high;
        if (score >= 6) return SKILL_COLORS.medium;
        return SKILL_COLORS.low;
    };

    // Helper to get score badge class
    const getScoreBadgeClass = (score: number) => {
        if (score >= 8) return 'badge-success';
        if (score >= 6) return 'badge-warning';
        return 'badge-error';
    };

    if (salespersonLoading) {
        return (
            <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href={`/dashboard/salesperson/${salespersonId}`}>
                    <button type="button" className="btn btn-ghost btn-sm">
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">{skillName}</h1>
                    <p className="text-sm text-base-content/60">{repName}</p>
                </div>
            </div>

            {/* Score Distribution */}
            <div className="card bg-base-200 border border-base-content/30">
                <div className="card-body">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        <h2 className="card-title text-lg">Score Distribution</h2>
                    </div>

                    {distributionLoading ? (
                        <div className="flex justify-center py-8">
                            <span className="loading loading-spinner loading-md"></span>
                        </div>
                    ) : distribution && distribution.length > 0 ? (
                        <div style={{ width: '100%', height: '300px' }}>
                            <ResponsiveContainer>
                                <BarChart data={distribution}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-base-300" />
                                    <XAxis
                                        dataKey="score"
                                        label={{ value: 'Score', position: 'insideBottom', offset: -5 }}
                                        className="text-xs"
                                        tick={{ fill: 'currentColor' }}
                                    />
                                    <YAxis
                                        label={{ value: 'Call Count', angle: -90, position: 'insideLeft' }}
                                        className="text-xs"
                                        tick={{ fill: 'currentColor' }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--b1))',
                                            border: '1px solid hsl(var(--bc) / 0.2)',
                                            borderRadius: '0.5rem',
                                        }}
                                        formatter={(value: number, name: string, props: any) => {
                                            return [`${value} call${value !== 1 ? 's' : ''} (${props.payload.percentage}%)`, 'Count'];
                                        }}
                                        labelFormatter={(score) => `Score: ${score}/10`}
                                    />
                                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                        {distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-base-content/60">
                            <p className="text-sm">No distribution data available</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Call-by-Call Details */}
            <div className="card bg-base-200 border border-base-content/30">
                <div className="card-body">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <h2 className="card-title text-lg">Call-by-Call Performance</h2>
                    </div>

                    {callsLoading ? (
                        <div className="flex justify-center py-8">
                            <span className="loading loading-spinner loading-md"></span>
                        </div>
                    ) : callDetails && callDetails.length > 0 ? (
                        <div className="space-y-4">
                            {callDetails.map((call) => (
                                <div
                                    key={call.interactionId}
                                    className="border border-base-content/30 rounded-lg p-4 hover:border-primary/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <Link href={`/dashboard/training/${call.interactionId}`}>
                                                <h3 className="font-medium hover:text-primary cursor-pointer flex items-center gap-2">
                                                    {call.blurb}
                                                    <ExternalLink className="h-3 w-3" />
                                                </h3>
                                            </Link>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-base-content/60">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {call.date ? new Date(call.date).toLocaleDateString() : 'N/A'}
                                                </span>
                                                <span className="badge badge-ghost badge-sm">Overall: {call.overallRating}/10</span>
                                            </div>
                                        </div>
                                        <span className={`badge ${getScoreBadgeClass(call.score)} font-bold`}>{call.score}/10</span>
                                    </div>

                                    {/* Evidence */}
                                    <div className="bg-base-200 rounded p-3 mb-2">
                                        <p className="text-xs font-medium text-base-content/70 mb-1">Evidence</p>
                                        <p className="text-sm">{call.evidence}</p>
                                    </div>

                                    {/* Missed Opportunity */}
                                    {call.missedOpportunity && (
                                        <div className="bg-warning/10 border border-warning/30 rounded p-3">
                                            <p className="text-xs font-medium text-warning mb-1">Missed Opportunity</p>
                                            <p className="text-sm">{call.missedOpportunity}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-base-content/60">
                            <p className="text-sm">No calls recorded for this skill</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
