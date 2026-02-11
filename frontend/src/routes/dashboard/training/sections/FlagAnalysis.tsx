import { tw } from '#util/tw';
import { DollarSign, AlertTriangle, Lightbulb, Users } from 'lucide-react';

const SectionHeader = tw.h2`text-lg font-semibold flex items-center gap-2 mb-3`;
const Tile = tw.div`bg-base-300 rounded-lg p-4`;

interface FlagAnalysisProps {
    flagData: any;
}

// Helper to get confidence color
function getConfidenceColor(confidence: number): string {
    if (confidence >= 80) return 'text-success';
    if (confidence >= 60) return 'text-warning';
    return 'text-error';
}

export function FlagAnalysis({ flagData }: FlagAnalysisProps) {
    const data = flagData.flagData;
    const revenueImpact = data?.revenue_impact;
    const confidence = data?.confidenceOutOf100 ?? 0;
    const whatHappened = data?.what_happened;
    const whyThisMatters = data?.why_this_matters;
    const prospectSaid = data?.prospect_said;
    const repSaid = data?.rep_said;

    // Extract key metrics for Revenue Impact tile
    const extractMetrics = () => {
        const text = `${revenueImpact ?? ''} ${whatHappened ?? ''}`;
        const winProbMatch = text.match(/win probability[:\s]*(-?\d+)%?/i);
        const dealValueMatch = text.match(/\$[\d,]+[KkMm]?|\d+[KkMm]\s*(?:ARR|deal|opportunity)/i);

        return {
            winProbImpact: winProbMatch ? winProbMatch[1] : null,
            dealValue: dealValueMatch ? dealValueMatch[0] : null,
        };
    };

    const metrics = extractMetrics();

    return (
        <div className="space-y-6">
            {/* TILE 1: What Happened (includes Conversation Evidence) */}
            <div>
                <SectionHeader>
                    <AlertTriangle className="w-5 h-5 text-warning" />
                    What Happened
                </SectionHeader>
                <Tile>
                    {/* Main Analysis */}
                    {whatHappened && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap mb-4">{whatHappened}</p>
                    )}

                    {/* Conversation Evidence - embedded in What Happened */}
                    {(prospectSaid || repSaid) && (
                        <div className="space-y-3 pt-3 border-t border-base-content/10">
                            <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wide flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                Conversation Evidence
                            </div>
                            {prospectSaid && (
                                <div className="bg-info/10 border-l-3 border-info rounded-r pl-3 py-2">
                                    <div className="text-xs font-semibold text-info mb-1">PROSPECT:</div>
                                    <p className="text-sm italic">"{prospectSaid}"</p>
                                </div>
                            )}
                            {repSaid && (
                                <div className="bg-primary/10 border-l-3 border-primary rounded-r pl-3 py-2">
                                    <div className="text-xs font-semibold text-primary mb-1">REP:</div>
                                    <p className="text-sm italic">"{repSaid}"</p>
                                </div>
                            )}
                        </div>
                    )}

                    {!whatHappened && !prospectSaid && !repSaid && (
                        <p className="text-sm text-base-content/60">No analysis data available</p>
                    )}
                </Tile>
            </div>

            {/* TILE 2: Why This Matters */}
            <div>
                <SectionHeader>
                    <Lightbulb className="w-5 h-5 text-warning" />
                    Why This Matters
                </SectionHeader>
                <Tile className="border-l-4 border-l-warning">
                    {whyThisMatters ? (
                        <p className="text-sm leading-relaxed">{whyThisMatters}</p>
                    ) : (
                        <p className="text-sm text-base-content/60">
                            Addressing this coaching opportunity directly impacts deal progression and win rates.
                            When reps master this skill, they build stronger prospect relationships and move deals forward more effectively.
                        </p>
                    )}
                </Tile>
            </div>

            {/* TILE 3: Revenue Impact (simplified metrics) */}
            <div>
                <SectionHeader>
                    <DollarSign className="w-5 h-5 text-success" />
                    Revenue Impact
                </SectionHeader>
                <Tile>
                    {/* Compact metrics row */}
                    <div className="flex flex-wrap gap-4 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-base-content/60">Confidence:</span>
                            <span className={`font-bold ${getConfidenceColor(confidence)}`}>{confidence}%</span>
                        </div>
                        {metrics.winProbImpact && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-base-content/60">Win Prob:</span>
                                <span className={`font-bold ${parseInt(metrics.winProbImpact) < 0 ? 'text-error' : 'text-success'}`}>
                                    {parseInt(metrics.winProbImpact) > 0 ? '+' : ''}{metrics.winProbImpact}%
                                </span>
                            </div>
                        )}
                        {metrics.dealValue && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-base-content/60">At Risk:</span>
                                <span className="font-bold text-warning">{metrics.dealValue}</span>
                            </div>
                        )}
                    </div>

                    {/* Revenue impact description */}
                    {revenueImpact ? (
                        <p className="text-sm leading-relaxed text-base-content/80">{revenueImpact}</p>
                    ) : (
                        <p className="text-sm text-base-content/60">No specific revenue impact calculated</p>
                    )}
                </Tile>
            </div>
        </div>
    );
}
