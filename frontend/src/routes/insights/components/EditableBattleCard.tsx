import { Copy, PlayCircle, Pencil, Check, X, Plus, Trash2 } from 'lucide-react';
import type { BattleCard as BattleCardType, UpdateBattleCardInput } from '#data/battle-cards';
import { useUpdateBattleCard } from '#data/battle-cards';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMySalesData } from '#util/useMe';

interface EditableBattleCardProps {
    battleCard: BattleCardType;
    showPracticeButton?: boolean;
    scenarioId?: number;
    canEdit?: boolean;
    onUpdate?: (updatedCard: BattleCardType) => void;
}

type EditingField = 'strategy' | 'approach' | 'script' | 'nextStep' | null;

export function EditableBattleCard({
    battleCard,
    showPracticeButton = true,
    scenarioId,
    canEdit = false,
    onUpdate,
}: EditableBattleCardProps) {
    const [, navigate] = useLocation();
    const [copied, setCopied] = useState(false);
    const [editingField, setEditingField] = useState<EditingField>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [editApproach, setEditApproach] = useState<string[]>([]);

    const { mutate: updateBattleCard, isPending: isUpdating } = useUpdateBattleCard();
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
        if (scenarioId && salesData?.salesperson?.id) {
            navigate(`/salesperson/${salesData.salesperson.id}/training/${scenarioId}`);
        }
    };

    const startEditing = (field: EditingField) => {
        if (!canEdit || !field) return;
        setEditingField(field);
        if (field === 'approach') {
            setEditApproach([...battleCard.approach]);
        } else {
            setEditValue(battleCard[field]);
        }
    };

    const cancelEditing = () => {
        setEditingField(null);
        setEditValue('');
        setEditApproach([]);
    };

    const saveEdit = () => {
        if (!editingField) return;

        const data: UpdateBattleCardInput = {};
        if (editingField === 'approach') {
            data.approach = editApproach.filter((item) => item.trim() !== '');
        } else {
            data[editingField] = editValue;
        }

        updateBattleCard(
            { id: battleCard.id, data },
            {
                onSuccess: (updatedCard) => {
                    setEditingField(null);
                    setEditValue('');
                    setEditApproach([]);
                    onUpdate?.(updatedCard);
                },
            },
        );
    };

    const updateApproachItem = (index: number, value: string) => {
        const newApproach = [...editApproach];
        newApproach[index] = value;
        setEditApproach(newApproach);
    };

    const addApproachItem = () => {
        setEditApproach([...editApproach, '']);
    };

    const removeApproachItem = (index: number) => {
        setEditApproach(editApproach.filter((_, i) => i !== index));
    };

    const renderEditableField = (field: EditingField, label: string, value: string, isTextarea = false, extraContent?: React.ReactNode) => {
        const isEditing = editingField === field;

        return (
            <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">{label}</h4>
                    <div className="flex items-center gap-1">
                        {extraContent}
                        {canEdit && !isEditing && (
                            <button className="btn btn-ghost btn-xs" onClick={() => startEditing(field)} aria-label={`Edit ${label}`}>
                                <Pencil className="w-3 h-3" />
                            </button>
                        )}
                        {isEditing && (
                            <>
                                <button
                                    className="btn btn-ghost btn-xs text-success"
                                    onClick={saveEdit}
                                    disabled={isUpdating}
                                    aria-label="Save"
                                >
                                    {isUpdating ? (
                                        <span className="loading loading-spinner loading-xs"></span>
                                    ) : (
                                        <Check className="w-3 h-3" />
                                    )}
                                </button>
                                <button
                                    className="btn btn-ghost btn-xs text-error"
                                    onClick={cancelEditing}
                                    disabled={isUpdating}
                                    aria-label="Cancel"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {isEditing ? (
                    isTextarea ? (
                        <textarea
                            className="textarea textarea-bordered w-full min-h-24"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            disabled={isUpdating}
                        />
                    ) : (
                        <input
                            type="text"
                            className="input input-bordered w-full input-sm"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            disabled={isUpdating}
                        />
                    )
                ) : field === 'script' ? (
                    <div className="p-3 bg-base-300/30 rounded border-l-2 border-l-primary/50">
                        <p className="text-sm text-base-content/80 whitespace-pre-line">{value}</p>
                    </div>
                ) : (
                    <p className="text-sm text-base-content/70">{value}</p>
                )}
            </div>
        );
    };

    const renderApproachField = () => {
        const isEditing = editingField === 'approach';

        return (
            <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">Approach</h4>
                    <div className="flex items-center gap-1">
                        {canEdit && !isEditing && (
                            <button className="btn btn-ghost btn-xs" onClick={() => startEditing('approach')} aria-label="Edit Approach">
                                <Pencil className="w-3 h-3" />
                            </button>
                        )}
                        {isEditing && (
                            <>
                                <button
                                    className="btn btn-ghost btn-xs text-success"
                                    onClick={saveEdit}
                                    disabled={isUpdating}
                                    aria-label="Save"
                                >
                                    {isUpdating ? (
                                        <span className="loading loading-spinner loading-xs"></span>
                                    ) : (
                                        <Check className="w-3 h-3" />
                                    )}
                                </button>
                                <button
                                    className="btn btn-ghost btn-xs text-error"
                                    onClick={cancelEditing}
                                    disabled={isUpdating}
                                    aria-label="Cancel"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {isEditing ? (
                    <div className="space-y-2">
                        {editApproach.map((point, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <span className="text-primary">•</span>
                                <input
                                    type="text"
                                    className="input input-bordered input-sm flex-1"
                                    value={point}
                                    onChange={(e) => updateApproachItem(index, e.target.value)}
                                    disabled={isUpdating}
                                    placeholder="Enter approach point..."
                                />
                                <button
                                    className="btn btn-ghost btn-xs text-error"
                                    onClick={() => removeApproachItem(index)}
                                    disabled={isUpdating}
                                    aria-label="Remove"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        <button className="btn btn-ghost btn-xs" onClick={addApproachItem} disabled={isUpdating}>
                            <Plus className="w-3 h-3" />
                            Add point
                        </button>
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {battleCard.approach.map((point) => (
                            <li key={point} className="text-sm text-base-content/70 flex items-start gap-2">
                                <span className="text-primary mt-0.5">•</span>
                                {point}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{battleCard.title}</h3>
                    {editingField === 'strategy' ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                className="input input-bordered input-sm flex-1"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                disabled={isUpdating}
                            />
                            <button className="btn btn-ghost btn-xs text-success" onClick={saveEdit} disabled={isUpdating}>
                                {isUpdating ? <span className="loading loading-spinner loading-xs"></span> : <Check className="w-3 h-3" />}
                            </button>
                            <button className="btn btn-ghost btn-xs text-error" onClick={cancelEditing} disabled={isUpdating}>
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-base-content/70">{battleCard.strategy}</p>
                            {canEdit && (
                                <button
                                    className="btn btn-ghost btn-xs"
                                    onClick={() => startEditing('strategy')}
                                    aria-label="Edit Strategy"
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <span className={`badge ${getPhaseColor(battleCard.phase)}`}>{battleCard.phase}</span>
            </div>

            {/* Approach */}
            {renderApproachField()}

            {/* Script */}
            {renderEditableField(
                'script',
                'Script',
                battleCard.script,
                true,
                <button className="btn btn-ghost btn-xs" onClick={handleCopyScript} aria-label="Copy script">
                    <Copy className="w-3 h-3" />
                    {copied ? 'Copied!' : 'Copy'}
                </button>,
            )}

            {/* Next Step */}
            {renderEditableField('nextStep', 'Next Step', battleCard.nextStep)}

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
