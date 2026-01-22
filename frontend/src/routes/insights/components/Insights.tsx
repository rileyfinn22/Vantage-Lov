import { useState } from 'react';
import { useLocation } from 'wouter';
import { useInsightsData, type SalesPhase, type TimePeriod, type Objection, type ProspectPainpoint } from '#data/insights';
import { TrendingUp, TrendingDown, Target, AlertTriangle, Clock } from 'lucide-react';

export function Insights() {
    const [, navigate] = useLocation();
    const [selectedPhase, setSelectedPhase] = useState<SalesPhase>('outreach');
    const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');

    const { data, isPending: loading, error } = useInsightsData();

    const phases: { key: SalesPhase; label: string; icon: React.ReactNode }[] = [
        { key: 'outreach', label: 'Outreach', icon: <Target className="w-5 h-5" /> },
        { key: 'demo', label: 'Demo', icon: <Clock className="w-5 h-5" /> },
        { key: 'close', label: 'Close', icon: <AlertTriangle className="w-5 h-5" /> },
    ];

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

    const handleItemClick = (itemId: string, itemType: 'objection' | 'prospect-pain' | 'rep-pain') => {
        navigate(`/insights/${itemType}/${itemId}`);
    };

    // Filter data by selected phase
    const filterByPhase = <T extends { phase: SalesPhase }>(items: T[]): T[] => {
        return items.filter((item) => item.phase === selectedPhase);
    };

    const filteredObjections = data ? filterByPhase(data.objections).slice(0, 3) : [];
    const filteredProspectPainpoints = data ? filterByPhase(data.prospectPainpoints).slice(0, 3) : [];

    const renderObjectionCard = (objection: Objection) => (
        <div
            key={objection.id}
            className="p-3 bg-base-200 border border-base-content/30 rounded-lg transition-colors hover:bg-base-200/80 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => handleItemClick(objection.id, 'objection')}
            onKeyDown={(e) => e.key === 'Enter' && handleItemClick(objection.id, 'objection')}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{objection.title}</h4>
                        {getTrendIcon(objection.trend)}
                        <span className={`badge badge-xs ${getImpactBadge(objection.impact)}`}>{objection.impact}</span>
                    </div>
                    <p className="text-xs text-base-content/60 line-clamp-2">{objection.description}</p>
                </div>
                <div className="text-right ml-3">
                    <div className="text-base font-semibold">{objection.frequency}%</div>
                    <div className="text-xs text-base-content/50">frequency</div>
                </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-base-content/10">
                <button
                    className="btn btn-outline btn-xs"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(objection.id, 'objection');
                    }}
                >
                    View Details
                </button>
            </div>
        </div>
    );

    const renderPainpointCard = (painpoint: ProspectPainpoint) => (
        <div
            key={painpoint.id}
            className="p-3 bg-base-200 border border-base-content/30 rounded-lg transition-colors hover:bg-base-200/80 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => handleItemClick(painpoint.id, 'prospect-pain')}
            onKeyDown={(e) => e.key === 'Enter' && handleItemClick(painpoint.id, 'prospect-pain')}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{painpoint.title}</h4>
                        <span className={`badge badge-xs ${getSeverityBadge(painpoint.severity)}`}>{painpoint.severity}</span>
                    </div>
                    <p className="text-xs text-base-content/60 line-clamp-2">{painpoint.description}</p>
                </div>
                <div className="text-right ml-3">
                    <div className="text-base font-semibold">{painpoint.frequency}%</div>
                    <div className="text-xs text-base-content/50">affected prospects</div>
                </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-base-content/10">
                <button
                    className="btn btn-outline btn-xs"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(painpoint.id, 'prospect-pain');
                    }}
                >
                    View Details
                </button>
            </div>
        </div>
    );

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Sales Insights</h1>
                </div>
                <select
                    className="select select-bordered select-sm w-32"
                    value={timePeriod}
                    onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
                >
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="quarter">Quarter</option>
                </select>
            </div>

            {/* Phase Tabs */}
            <div role="tablist" className="tabs tabs-boxed bg-base-200 p-1 h-14">
                {phases.map((phase) => (
                    <button
                        key={phase.key}
                        role="tab"
                        className={`tab h-full flex-1 gap-2 text-lg ${selectedPhase === phase.key ? 'tab-active bg-base-200' : ''}`}
                        onClick={() => setSelectedPhase(phase.key)}
                    >
                        {phase.icon}
                        {phase.label}
                    </button>
                ))}
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex justify-center items-center py-12">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="alert alert-error">
                    <span>Failed to load insights: {String(error)}</span>
                </div>
            )}

            {/* Content - 2 Column Layout */}
            {!loading && !error && data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Top Prospect Objections */}
                    <div className="bg-base-200 rounded-lg border border-base-content/20 shadow-sm">
                        <div className="p-4 pb-2">
                            <h2 className="text-base font-semibold flex items-center gap-2 text-error">
                                <TrendingUp className="w-5 h-5" />
                                Top Prospect Objections
                            </h2>
                        </div>
                        <div className="p-4 pt-2 space-y-3">
                            {filteredObjections.length > 0 ? (
                                filteredObjections.map(renderObjectionCard)
                            ) : (
                                <div className="text-center py-6 text-base-content/50">
                                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No objections in {selectedPhase} phase</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Top Prospect Pain Points */}
                    <div className="bg-base-200 rounded-lg border border-base-content/20 shadow-sm">
                        <div className="p-4 pb-2">
                            <h2 className="text-base font-semibold flex items-center gap-2 text-info">
                                <Target className="w-5 h-5" />
                                Top Prospect Pain Points
                            </h2>
                        </div>
                        <div className="p-4 pt-2 space-y-3">
                            {filteredProspectPainpoints.length > 0 ? (
                                filteredProspectPainpoints.map((p) => renderPainpointCard(p))
                            ) : (
                                <div className="text-center py-6 text-base-content/50">
                                    <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No prospect pain points in {selectedPhase} phase</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
