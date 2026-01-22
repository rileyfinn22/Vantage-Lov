import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useSkillsTrends } from '#data/skills';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SkillsTrendsChartProps {
    salespersonId: string;
    repName?: string;
    compact?: boolean;
}

type PeriodType = 'week' | 'month' | 'quarter' | 'all';

const SKILL_COLORS = {
    overallRating: '#8b5cf6', // purple
    objectionHandling: '#3b82f6', // blue
    pricingDiscussions: '#10b981', // green
    discovery: '#f59e0b', // amber
    closing: '#ef4444', // red
};

/**
 * SkillsTrendsChart Component
 *
 * Displays skill progression over time with interactive period selection.
 * Shows all 4 skills plus overall rating as line series on a single chart.
 */
export function SkillsTrendsChart({ salespersonId, repName, compact = false }: SkillsTrendsChartProps) {
    const [period, setPeriod] = useState<PeriodType>('month');
    const [limit, setLimit] = useState(compact ? 6 : 12);

    const { data: trends, isPending, error } = useSkillsTrends(salespersonId, period, limit);

    // Transform data for recharts format
    const chartData = (trends ?? [])
        .map((trend: any) => {
            // Format the period date
            const date = new Date(trend.period);
            let formattedPeriod: string;

            switch (period) {
                case 'week':
                    formattedPeriod = `${date.getMonth() + 1}/${date.getDate()}`;
                    break;
                case 'quarter':
                    formattedPeriod = `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
                    break;
                case 'all':
                    formattedPeriod = date.getFullYear().toString();
                    break;
                default: // month
                    formattedPeriod = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }

            return {
                period: formattedPeriod,
                overallRating: trend.metrics.overallRating.average,
                objectionHandling: trend.metrics.objectionHandling.average,
                pricingDiscussions: trend.metrics.pricingDiscussions.average,
                discovery: trend.metrics.discovery.average,
                closing: trend.metrics.closing.average,
                callCount: trend.callCount,
            };
        })
        .reverse(); // Reverse to show oldest to newest

    const periodOptions = [
        { value: 'week', label: 'Week', limit: 12 },
        { value: 'month', label: 'Month', limit: 12 },
        { value: 'quarter', label: 'Quarter', limit: 8 },
        { value: 'all', label: 'All Time', limit: 50 },
    ] as const;

    const handlePeriodChange = (newPeriod: PeriodType) => {
        const option = periodOptions.find((opt) => opt.value === newPeriod);
        setPeriod(newPeriod);
        if (option) {
            setLimit(option.limit);
        }
    };

    if (isPending) {
        return (
            <div className="card bg-base-200 border border-base-content/30">
                <div className={compact ? 'card-body p-4' : 'card-body'}>
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className={compact ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} />
                        <h3 className={compact ? 'card-title text-sm' : 'card-title text-lg'}>Skills Trends</h3>
                    </div>
                    <div className={compact ? 'flex justify-center py-4' : 'flex justify-center py-8'}>
                        <span className="loading loading-spinner loading-md"></span>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card bg-base-200 border border-base-content/30">
                <div className={compact ? 'card-body p-4' : 'card-body'}>
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className={compact ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} />
                        <h3 className={compact ? 'card-title text-sm' : 'card-title text-lg'}>Skills Trends</h3>
                    </div>
                    <div className="alert alert-error">
                        <span>Error loading trends data</span>
                    </div>
                </div>
            </div>
        );
    }

    const hasData = chartData.length > 0;

    return (
        <div className="card bg-base-200 border border-base-content/30">
            <div className={compact ? 'card-body p-4' : 'card-body'}>
                <div className={compact ? 'flex items-center justify-between mb-2' : 'flex items-center justify-between mb-4'}>
                    <div className="flex items-center gap-2">
                        <TrendingUp className={compact ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} />
                        <h3 className={compact ? 'card-title text-sm' : 'card-title text-lg'}>
                            Skills Trends{!compact && repName ? ` - ${repName}` : ''}
                        </h3>
                    </div>

                    {/* Period selector - hide in compact mode */}
                    {!compact && (
                        <div className="join">
                            {periodOptions.map((option) => (
                                <button
                                    key={option.value}
                                    className={`btn btn-sm join-item ${period === option.value ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => handlePeriodChange(option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {!hasData ? (
                    <div className={compact ? 'text-center py-4 text-base-content/60' : 'text-center py-8 text-base-content/60'}>
                        <p className="text-sm">No trend data available</p>
                        {!compact && <p className="text-xs mt-2">Trends appear after multiple calls over time</p>}
                    </div>
                ) : (
                    <div className={compact ? 'space-y-2' : 'space-y-4'}>
                        {/* Chart */}
                        <div style={{ width: '100%', height: compact ? '160px' : '300px' }}>
                            <ResponsiveContainer>
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-base-300" />
                                    <XAxis
                                        dataKey="period"
                                        className="text-xs"
                                        tick={{ fill: 'currentColor', fontSize: compact ? 10 : 12 }}
                                    />
                                    <YAxis
                                        domain={[0, 10]}
                                        className="text-xs"
                                        tick={{ fill: 'currentColor', fontSize: compact ? 10 : 12 }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--b1))',
                                            border: '1px solid hsl(var(--bc) / 0.2)',
                                            borderRadius: '0.5rem',
                                        }}
                                        formatter={(value: any) => (value !== null && value !== undefined ? value.toFixed(1) : 'N/A')}
                                    />
                                    {!compact && <Legend wrapperStyle={{ fontSize: '0.875rem' }} />}

                                    <Line
                                        type="monotone"
                                        dataKey="overallRating"
                                        stroke={SKILL_COLORS.overallRating}
                                        strokeWidth={compact ? 1.5 : 2}
                                        name="Overall"
                                        connectNulls
                                        dot={!compact}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="objectionHandling"
                                        stroke={SKILL_COLORS.objectionHandling}
                                        strokeWidth={compact ? 1.5 : 2}
                                        name="Objection Handling"
                                        connectNulls
                                        dot={!compact}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="pricingDiscussions"
                                        stroke={SKILL_COLORS.pricingDiscussions}
                                        strokeWidth={compact ? 1.5 : 2}
                                        name="Pricing"
                                        connectNulls
                                        dot={!compact}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="discovery"
                                        stroke={SKILL_COLORS.discovery}
                                        strokeWidth={compact ? 1.5 : 2}
                                        name="Discovery"
                                        connectNulls
                                        dot={!compact}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="closing"
                                        stroke={SKILL_COLORS.closing}
                                        strokeWidth={compact ? 1.5 : 2}
                                        name="Closing"
                                        connectNulls
                                        dot={!compact}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Summary stats */}
                        <div className="text-xs text-base-content/60 text-center pt-2 border-t border-base-300">
                            {compact ? (
                                `${chartData.reduce((sum: number, d: any) => sum + d.callCount, 0)} calls`
                            ) : (
                                <>
                                    Showing {chartData.length}{' '}
                                    {period === 'week'
                                        ? 'weeks'
                                        : period === 'month'
                                          ? 'months'
                                          : period === 'quarter'
                                            ? 'quarters'
                                            : 'years'}
                                    {' • '}
                                    {chartData.reduce((sum: number, d: any) => sum + d.callCount, 0)} total calls
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
