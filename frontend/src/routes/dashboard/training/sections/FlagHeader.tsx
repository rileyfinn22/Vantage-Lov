import { useQueryClient } from '@tanstack/react-query';
import { tw } from '#util/tw';
import { formatDateShort } from '#util';
import { getBriefFlagTitle } from '#util/flags';
import { queryFlagData } from '#data/fetchers';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

export function FlagHeader({ flagData, salespersonData, relatedInteraction, currentFlagIndex, totalFlags, onNavigate }: FlagHeaderProps) {
    const queryClient = useQueryClient();

    // Extract prospect info, filtering out placeholder values
    const prospectName = relatedInteraction?.metadata?.prospect?.name;
    const prospectCompanyRaw = relatedInteraction?.metadata?.prospect?.company;
    const prospectCompany = prospectCompanyRaw && prospectCompanyRaw.toLowerCase() !== 'not specified' ? prospectCompanyRaw : null;

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
                    </div>

                    <NavigationControls>
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
