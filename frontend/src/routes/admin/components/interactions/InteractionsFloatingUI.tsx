import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCreate } from '@refinedev/core';
import InteractionLineItem from './InteractionLineItem';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import type { InteractionWithRelationsAPI } from './useInteractionsWithRelations';

interface InteractionsFloatingUIProps {
    salespersonId: number;
    interactions: InteractionWithRelationsAPI[];
    currentPage: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onClose: () => void;
    onInteractionAdded?: () => void;
    onInteractionDeleted?: () => void;
}

const InteractionsFloatingUI = ({
    salespersonId,
    interactions,
    currentPage,
    pageSize,
    totalCount,
    onPageChange,
    onClose,
    onInteractionAdded,
    onInteractionDeleted,
}: InteractionsFloatingUIProps) => {
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [blurb, setBlurb] = useState('');

    const {
        mutate: createInteraction,
        mutation: { isPending: isCreating },
    } = useCreate();

    const handleKeyDown = (e: React.KeyboardEvent, callback: () => void) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            callback();
        }
    };

    const handleCreateInteraction = () => {
        if (!blurb.trim()) {
            addNotification('Please enter a description for the interaction', 'warning');
            return;
        }

        createInteraction(
            {
                resource: 'interactions',
                values: {
                    blurb: blurb.trim(),
                    rawInteractionText: blurb.trim(),
                    salespersonId: salespersonId,
                },
            },
            {
                onSuccess: () => {
                    setBlurb('');
                    setShowAddDialog(false);
                    addNotification('Interaction created successfully', 'success');
                    onInteractionAdded?.();
                },
                onError: (error) => {
                    console.error('Error creating interaction:', error);
                    addNotification('Failed to create interaction', 'error');
                },
            },
        );
    };

    return (
        <div className="flex h-full flex-col gap-2 p-4 relative">
            <div className="flex items-center justify-between gap-2 border-b border-base-300 pb-2">
                <div>
                    <h3 className="text-lg font-semibold">Interactions</h3>
                    <p className="text-xs text-base-content/60">
                        {totalCount === 0
                            ? 'No interactions'
                            : `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
                    </p>
                </div>
                <button onClick={onClose} className="btn btn-xs btn-ghost" aria-label="Close dialog">
                    ✕
                </button>
            </div>

            {interactions.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/40">
                    <p className="px-4 py-8 text-center text-sm text-base-content/60">No interactions found</p>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden rounded-lg border border-base-300 bg-base-200/40 flex flex-col">
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {interactions.map((interaction) => (
                            <InteractionLineItem key={interaction.id} interaction={interaction} onDelete={onInteractionDeleted} />
                        ))}
                    </div>

                    {/* Pagination Controls */}
                    {totalCount > pageSize && (
                        <div className="border-t border-base-300 p-2 flex items-center justify-center gap-2">
                            <div className="join">
                                <button
                                    className="join-item btn btn-sm"
                                    onClick={() => onPageChange(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button className="join-item btn btn-sm no-animation">
                                    Page {currentPage} of {Math.ceil(totalCount / pageSize)}
                                </button>
                                <button
                                    className="join-item btn btn-sm"
                                    onClick={() => onPageChange(currentPage + 1)}
                                    disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Floating Action Button */}
            <button
                className="btn btn-circle btn-primary shadow-lg absolute bottom-4 right-4"
                onClick={() => setShowAddDialog(true)}
                aria-label="Add new interaction"
            >
                <Plus />
            </button>

            {/* Add Interaction Dialog */}
            {showAddDialog && (
                <dialog open className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-semibold text-base mb-3">Add New Interaction</h3>
                        <textarea
                            className="textarea textarea-bordered w-full text-sm"
                            placeholder="Enter interaction description..."
                            value={blurb}
                            onChange={(e) => setBlurb(e.target.value)}
                            rows={3}
                        />
                        <div className="modal-action">
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddDialog(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleCreateInteraction}
                                disabled={isCreating || !blurb.trim()}
                            >
                                {isCreating ? (
                                    <>
                                        <span className="loading loading-spinner loading-xs"></span>
                                        Creating...
                                    </>
                                ) : (
                                    'Create'
                                )}
                            </button>
                        </div>
                    </div>
                    <form
                        method="dialog"
                        className="modal-backdrop"
                        onClick={() => setShowAddDialog(false)}
                        onKeyDown={(e) => handleKeyDown(e, () => setShowAddDialog(false))}
                    >
                        <button type="button">close</button>
                    </form>
                </dialog>
            )}
        </div>
    );
};

export default InteractionsFloatingUI;
