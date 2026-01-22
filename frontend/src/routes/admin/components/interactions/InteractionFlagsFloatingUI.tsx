import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Send, Check } from 'lucide-react';
import { formatDateShort } from '#util';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from '#/data/client';
import { addNotification } from '#/routes/dashboard/layout/Notifications';

interface InteractionFlagsFloatingUIProps {
    interactionId: number;
    flags: Flag[];
    onClose: () => void;
}

type FlagData = {
    revision: 'v1';
    flag_title: string;
    confidenceOutOf100: number;
    validation_checklist: string[];
    what_happened: string;
    revenue_impact: string;
    better_response: string | string[];
    benchmarking_context: string;
    pattern_analysis?: string;
    role_expectation: string;
    why_this_matters: string;
    timestamps: { start?: string; end?: string };
    transcript_segment?: string[];
};

type Flag = {
    id: number;
    flagData: FlagData | null;
    reason: string | null;
    source: 'ollama' | 'human';
    complete: boolean;
    createdAt: string | null;
    interactionId: number | null;
    associatedSalespersonId: number;
    weeklyReviewStatus?: {
        weekAssigned: string;
        assignedAt: string;
        reviewedAt?: string;
        coachNotes?: string;
    } | null;
};

const InteractionFlagsFloatingUI = ({ interactionId, flags, onClose }: InteractionFlagsFloatingUIProps) => {
    const [expandedFlags, setExpandedFlags] = useState<Set<number>>(new Set());
    const [coachNotesInput, setCoachNotesInput] = useState<Record<number, string>>({});
    const [savedFlags, setSavedFlags] = useState<Set<number>>(new Set());
    const queryClient = useQueryClient();

    const toggleExpanded = (flagId: number) => {
        setExpandedFlags((prev) => {
            const next = new Set(prev);
            if (next.has(flagId)) {
                next.delete(flagId);
            } else {
                next.add(flagId);
            }
            return next;
        });
    };

    const { mutate: saveCoachNotes, isPending: isSaving } = useMutation({
        mutationFn: async ({ flagId, coachNotes }: { flagId: number; coachNotes: string }) => {
            const response = await ho.vantage.api.flags[':flagId']['coach-notes'].$post({
                param: { flagId: String(flagId) },
                json: { coachNotes },
            });

            if (!response.ok) {
                throw new Error('Failed to save coach notes');
            }

            return response.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['admin'] });
            addNotification('Coach notes saved', 'success');
            setSavedFlags((prev) => new Set(prev).add(variables.flagId));
            setTimeout(() => {
                setSavedFlags((prev) => {
                    const next = new Set(prev);
                    next.delete(variables.flagId);
                    return next;
                });
            }, 2000);
        },
        onError: (error) => {
            console.error('Save coach notes error:', error);
            addNotification('Failed to save coach notes', 'error');
        },
    });

    const handleSaveCoachNotes = (flagId: number) => {
        const notes = coachNotesInput[flagId];
        if (notes && notes.trim().length >= 10) {
            saveCoachNotes({ flagId, coachNotes: notes.trim() });
        } else {
            addNotification('Coach notes must be at least 10 characters', 'warning');
        }
    };

    return (
        <div className="flex h-full flex-col gap-2 p-4 relative">
            <div className="flex items-center justify-between gap-2 border-b border-base-300 pb-2">
                <div>
                    <h3 className="text-lg font-semibold">Flags</h3>
                    <p className="text-xs text-base-content/60">
                        Interaction #{interactionId} • {flags.length} flag{flags.length === 1 ? '' : 's'}
                    </p>
                </div>
                <button onClick={onClose} className="btn btn-xs btn-ghost" aria-label="Close dialog">
                    ✕
                </button>
            </div>

            {flags.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/40">
                    <p className="px-4 py-8 text-center text-sm text-base-content/60">No flags found</p>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden rounded-lg border border-base-300 bg-base-200/40">
                    <div className="h-full overflow-y-auto p-2 space-y-2">
                        {flags.map((flag) => {
                            const isExpanded = expandedFlags.has(flag.id);
                            const data = flag.flagData;

                            return (
                                <div key={flag.id} className="rounded-lg border border-base-300 bg-base-100 p-3 space-y-2 shadow-sm">
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <div className="font-semibold text-sm">
                                                {data?.flag_title ?? flag.reason ?? `Flag #${flag.id}`}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <span className="badge badge-xs badge-outline">{flag.source}</span>
                                                <span className={`badge badge-xs ${flag.complete ? 'badge-success' : 'badge-warning'}`}>
                                                    {flag.complete ? 'Completed' : 'Needs Training'}
                                                </span>
                                                {data?.confidenceOutOf100 !== undefined && (
                                                    <span className="badge badge-xs badge-info">{data.confidenceOutOf100}% confidence</span>
                                                )}
                                                {flag.createdAt && (
                                                    <span className="text-xs text-base-content/50">{formatDateShort(flag.createdAt)}</span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => toggleExpanded(flag.id)}
                                            className="btn btn-xs btn-ghost"
                                            aria-label="Toggle details"
                                        >
                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    {/* Expanded Details */}
                                    {isExpanded && data && (
                                        <div className="space-y-3 pt-2 border-t border-base-300">
                                            {data.what_happened && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">What Happened</div>
                                                    <div className="text-sm">{data.what_happened}</div>
                                                </div>
                                            )}

                                            {data.revenue_impact && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">Revenue Impact</div>
                                                    <div className="text-sm">{data.revenue_impact}</div>
                                                </div>
                                            )}

                                            {data.better_response && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">Better Response</div>
                                                    <div className="text-sm">{data.better_response}</div>
                                                </div>
                                            )}

                                            {data.benchmarking_context && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">
                                                        Benchmarking Context
                                                    </div>
                                                    <div className="text-sm">{data.benchmarking_context}</div>
                                                </div>
                                            )}

                                            {data.role_expectation && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">Role Expectation</div>
                                                    <div className="text-sm">{data.role_expectation}</div>
                                                </div>
                                            )}

                                            {data.why_this_matters && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">Why This Matters</div>
                                                    <div className="text-sm">{data.why_this_matters}</div>
                                                </div>
                                            )}

                                            {data.pattern_analysis && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">Pattern Analysis</div>
                                                    <div className="text-sm">{data.pattern_analysis}</div>
                                                </div>
                                            )}

                                            {data.validation_checklist && data.validation_checklist.length > 0 && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">
                                                        Validation Checklist
                                                    </div>
                                                    <ul className="list-disc list-inside space-y-1">
                                                        {data.validation_checklist.map((item, _idx) => (
                                                            <li key={item} className="text-sm">
                                                                {item}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {(data.timestamps.start || data.timestamps.end) && (
                                                <div>
                                                    <div className="font-medium text-xs text-base-content/70 mb-1">Timestamps</div>
                                                    <div className="text-sm">
                                                        {data.timestamps.start && `Start: ${data.timestamps.start}`}
                                                        {data.timestamps.start && data.timestamps.end && ' • '}
                                                        {data.timestamps.end && `End: ${data.timestamps.end}`}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Coach Notes Section */}
                                            <div className="pt-2 border-t border-base-300">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <MessageSquare className="w-4 h-4 text-primary" />
                                                    <div className="font-medium text-xs text-base-content/70">Coach Notes</div>
                                                </div>

                                                {/* Display existing notes */}
                                                {flag.weeklyReviewStatus?.coachNotes && (
                                                    <div className="bg-primary/10 rounded-lg p-3 mb-2">
                                                        <div className="text-sm">{flag.weeklyReviewStatus.coachNotes}</div>
                                                        {flag.weeklyReviewStatus.reviewedAt && (
                                                            <div className="text-xs text-base-content/50 mt-1">
                                                                Saved {formatDateShort(flag.weeklyReviewStatus.reviewedAt)}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Input for new/updated notes */}
                                                <div className="flex gap-2">
                                                    <textarea
                                                        className="textarea textarea-bordered textarea-sm flex-1 min-h-[60px]"
                                                        placeholder="Add coaching notes for this flag..."
                                                        value={coachNotesInput[flag.id] ?? flag.weeklyReviewStatus?.coachNotes ?? ''}
                                                        onChange={(e) =>
                                                            setCoachNotesInput((prev) => ({ ...prev, [flag.id]: e.target.value }))
                                                        }
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm self-end"
                                                        onClick={() => handleSaveCoachNotes(flag.id)}
                                                        disabled={isSaving}
                                                    >
                                                        {savedFlags.has(flag.id) ? (
                                                            <Check className="w-4 h-4" />
                                                        ) : isSaving ? (
                                                            <span className="loading loading-spinner loading-xs" />
                                                        ) : (
                                                            <Send className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractionFlagsFloatingUI;
