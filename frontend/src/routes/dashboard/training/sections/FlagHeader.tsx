import { useQueryClient } from '@tanstack/react-query';
import { tw } from '#util/tw';
import { formatDateShort } from '#util';
import { getBriefFlagTitle } from '#util/flags';
import { queryFlagData } from '#data/fetchers';
import { ChevronLeft, ChevronRight, AlertTriangle, TrendingDown, Target } from 'lucide-react';

// Header Components
const HeaderSection = tw.div`card bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 shadow-sm`;
const NavigationControls = tw.div`flex items-center gap-3`;

interface FlagHeaderProps {
    flagData: any;
    salespersonData: any;
    relatedInteraction: any;
    currentFlagIndex: number;
    totalFlags: number;
    onNavigate: (direction: 'prev' | 'next') => void;
}

// Helper to get severity indicator
function getSeverityBadge(confidence: number) {
    if (confidence >= 80) {
        return { label: 'High Priority', class: 'badge-error', icon: AlertTriangle };
    }
    if (confidence >= 60) {
        return { label: 'Medium Priority', class: 'badge-warning', icon: TrendingDown };
    }
    return { label: 'Review', class: 'badge-info', icon: Target };
}

export function FlagHeader({ flagData, salespersonData, relatedInteraction, currentFlagIndex, totalFlags, onNavigate }: FlagHeaderProps) {
    const queryClient = useQueryClient();

    // Extract prospect info, filtering out placeholder values
    const prospectName = relatedInteraction?.metadata?.prospect?.name;
    const prospectCompanyRaw = relatedInteraction?.metadata?.prospect?.company;
    const prospectCompany = prospectCompanyRaw && prospectCompanyRaw.toLowerCase() !== 'not specified' ? prospectCompanyRaw : null;

    // Extract confidence and metrics
    const confidence = flagData.flagData?.confidenceOutOf100 ?? 0;
    const severity = getSeverityBadge(confidence);
    const SeverityIcon = severity.icon;

    // Calculate adjacent flag IDs for prefetching
    const prevFlagId = currentFlagIndex > 0 ? salespersonData?.flags?.[currentFlagIndex - 1]?.id : null;
    const nextFlagId = currentFlagIndex < totalFlags - 1 ? salespersonData?.flags?.[currentFlagIndex + 1]?.id : null;

    const prefetchFlag = (flagId: number | null) => {
        if (!flagId) return;
        queryClient.prefetchQuery(queryFlagData(String(flagId)));
    };

    return (
        <HeaderSection>
            <div className="card-body">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        {/* Call Source - Name @ Company */}
                        {(prospectName ?? prospectCompany) && (
                            <div className="text-sm font-semibold text-base-content/60 mb-1">
                                {prospectName && prospectCompany
                                    ? `${prospectName} @ ${prospectCompany}`
                                    : (prospectName ?? prospectCompany)}
                            </div>
                        )}
                        <h1 className="text-3xl font-bold mb-2">{getBriefFlagTitle(flagData)}</h1>
                        <p className="text-sm text-base-content/70 mb-3">
                            {salespersonData?.salesperson?.firstName} {salespersonData?.salesperson?.lastName} • Created:{' '}
                            {formatDateShort(flagData.createdAt) || 'Unknown'}
                        </p>

                        {/* Quick Metrics Row */}
                        <div className="flex items-center gap-4 mt-3">
                            <div className="flex items-center gap-2 bg-base-300 rounded-lg px-3 py-1.5">
                                <span className="text-xs text-base-content/60">Confidence:</span>
                                <span className={`font-bold ${confidence >= 80 ? 'text-success' : confidence >= 60 ? 'text-warning' : 'text-error'}`}>
                                    {confidence}%
                                </span>
                            </div>
                            {flagData.flagData?.timestamps?.start && (
                                <div className="flex items-center gap-2 bg-base-300 rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-base-content/60">Timestamp:</span>
                                    <span className="font-mono text-sm">{flagData.flagData.timestamps.start}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <NavigationControls>
                        {/* Severity Badge */}
                        <div className={`badge ${severity.class} gap-1 whitespace-nowrap`}>
                            <SeverityIcon className="w-3 h-3" />
                            {severity.label}
                        </div>
                        {/* Flag Navigation */}
                        <div className="flex items-center gap-2">
                            <button
                                className="btn btn-ghost btn-sm btn-circle"
                                onClick={() => onNavigate('prev')}
                                onMouseEnter={() => prefetchFlag(prevFlagId)}
                                disabled={totalFlags <= 1}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-3 py-1 bg-base-200 rounded-lg text-xs font-medium min-w-[100px] text-center">
                                {currentFlagIndex + 1} of {totalFlags} flags
                            </span>
                            <button
                                className="btn btn-ghost btn-sm btn-circle"
                                onClick={() => onNavigate('next')}
                                onMouseEnter={() => prefetchFlag(nextFlagId)}
                                disabled={totalFlags <= 1}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </NavigationControls>
                </div>
            </div>
        </HeaderSection>
    );
}
