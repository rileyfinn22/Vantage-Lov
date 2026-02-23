import { Copy, PlayCircle } from 'lucide-react';
import type { BattleCard as BattleCardType } from '#data/battle-cards';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMySalesData } from '#util/useMe';

interface BattleCardProps {
    battleCard: BattleCardType;
    showPracticeButton?: boolean;
    scenarioId?: number;
}

export function BattleCard({ battleCard, showPracticeButton = true, scenarioId }: BattleCardProps) {
    const [, navigate] = useLocation();
    const [copied, setCopied] = useState(false);
    const { data: salesData } = useMySalesData();

    const getPhaseColor = (phase: string) => {
        switch (phase) {
            case 'outreach':
                return 'badge-info';
            case 'discovery':
                return 'badge-success';
            case 'demo':
                return 'badge-secondary';
            case 'close':
                return 'badge-warning';
            default:
                return 'badge-neutral';
        }
    };

    const handleCopyScript = async () => {
        try {
            await navigator.clipboard.writeText(battleCard.script);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy script:', err);
        }
    };

    const handlePractice = () => {
        if (scenarioId) {
            const salespersonId = salesData?.salesperson?.id ?? 0;
            navigate(`/salesperson/${salespersonId}/training/${scenarioId}`);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{battleCard.title}</h3>
                    <p className="text-sm text-base-content/70">{battleCard.strategy}</p>
                </div>
                <span className={`badge ${getPhaseColor(battleCard.phase)}`}>{battleCard.phase}</span>
            </div>

            {/* Approach */}
            <div className="mb-3">
                <h4 className="font-medium text-sm mb-1">Approach</h4>
                <ul className="space-y-1">
                    {battleCard.approach.map((point) => (
                        <li key={point} className="text-sm text-base-content/70 flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            {point}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Script */}
            <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">Script</h4>
                    <button className="btn btn-ghost btn-xs" onClick={handleCopyScript} aria-label="Copy script">
                        <Copy className="w-3 h-3" />
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <div className="p-3 bg-base-300/30 rounded border-l-2 border-l-primary/50">
                    <p className="text-sm text-base-content/80 whitespace-pre-line">{battleCard.script}</p>
                </div>
            </div>

            {/* Next Step */}
            <div>
                <h4 className="font-medium text-sm mb-1">Next Step</h4>
                <p className="text-sm text-base-content/70">{battleCard.nextStep}</p>
            </div>

            {/* Practice Button */}
            {showPracticeButton && scenarioId && (
                <div className="flex justify-end mt-3 pt-3 border-t border-base-content/10">
                    <button className="btn btn-primary btn-sm" onClick={handlePractice}>
                        <PlayCircle className="w-4 h-4" />
                        Practice This Scenario
                    </button>
                </div>
            )}
        </div>
    );
}
