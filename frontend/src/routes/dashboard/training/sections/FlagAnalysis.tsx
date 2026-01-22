import { tw } from '#util/tw';
import { DollarSign } from 'lucide-react';

const SectionHeader = tw.h2`text-lg font-semibold flex items-center gap-2`;

interface FlagAnalysisProps {
    flagData: any;
}

export function FlagAnalysis({ flagData }: FlagAnalysisProps) {
    const revenueImpact = flagData.flagData?.revenue_impact;

    return (
        <>
            <SectionHeader>
                <DollarSign className="w-5 h-5" />
                Revenue Impact
            </SectionHeader>
            <div className="mt-4">
                {revenueImpact ? (
                    <p className="text-sm leading-relaxed text-base-content/80">{revenueImpact}</p>
                ) : (
                    <p className="text-sm text-base-content/60">No revenue impact data available</p>
                )}
            </div>
        </>
    );
}
