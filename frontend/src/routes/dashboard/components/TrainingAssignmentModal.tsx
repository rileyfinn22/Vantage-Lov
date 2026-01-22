import { useState } from 'react';
import { X, Calendar, AlertCircle } from 'lucide-react';
import { useCreateTrainingAssignment } from '#data/training-assignments';

interface TrainingAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    salespersonId: number;
    salespersonName: string;
    skillName: string;
}

/**
 * TrainingAssignmentModal Component
 *
 * Modal for managers to assign training for a specific skill to a salesperson.
 * Allows setting due date, priority, and optional notes.
 */
export function TrainingAssignmentModal({ isOpen, onClose, salespersonId, salespersonName, skillName }: TrainingAssignmentModalProps) {
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
    const [notes, setNotes] = useState('');

    const createAssignment = useCreateTrainingAssignment();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            await createAssignment.mutateAsync({
                salespersonId,
                skillName,
                dueDate: dueDate || undefined,
                priority,
                notes: notes || undefined,
            });

            // Reset form and close modal
            setDueDate('');
            setPriority('normal');
            setNotes('');
            onClose();
        } catch (error) {
            console.error('Failed to assign training:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal modal-open">
            <div className="modal-box">
                <button type="button" className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>
                    <X className="h-4 w-4" />
                </button>

                <h3 className="font-bold text-lg mb-4">Assign Training</h3>

                <div className="mb-4 p-3 bg-base-200 rounded-lg">
                    <p className="text-sm">
                        <span className="font-medium">Salesperson:</span> {salespersonName}
                    </p>
                    <p className="text-sm">
                        <span className="font-medium">Skill:</span> {skillName}
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Due Date */}
                    <div className="form-control mb-4">
                        <label className="label" htmlFor="due-date">
                            <span className="label-text flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Due Date (Optional)
                            </span>
                        </label>
                        <input
                            id="due-date"
                            type="date"
                            className="input input-bordered"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                        />
                    </div>

                    {/* Priority */}
                    <div className="form-control mb-4">
                        <div className="label">
                            <span className="label-text flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                Priority
                            </span>
                        </div>
                        <div className="join w-full" role="group" aria-label="Priority selection">
                            <button
                                type="button"
                                className={`btn join-item flex-1 ${priority === 'low' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setPriority('low')}
                            >
                                Low
                            </button>
                            <button
                                type="button"
                                className={`btn join-item flex-1 ${priority === 'normal' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setPriority('normal')}
                            >
                                Normal
                            </button>
                            <button
                                type="button"
                                className={`btn join-item flex-1 ${priority === 'high' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setPriority('high')}
                            >
                                High
                            </button>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="form-control mb-6">
                        <label className="label">
                            <span className="label-text">Notes (Optional)</span>
                        </label>
                        <textarea
                            className="textarea textarea-bordered h-24"
                            placeholder="Add any additional context or instructions..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    {/* Error Display */}
                    {createAssignment.isError && (
                        <div className="alert alert-error mb-4">
                            <span>
                                {createAssignment.error instanceof Error ? createAssignment.error.message : 'Failed to assign training'}
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createAssignment.isPending}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={createAssignment.isPending}>
                            {createAssignment.isPending ? (
                                <>
                                    <span className="loading loading-spinner loading-sm"></span>
                                    Assigning...
                                </>
                            ) : (
                                'Assign Training'
                            )}
                        </button>
                    </div>
                </form>
            </div>
            <div className="modal-backdrop" onClick={onClose}></div>
        </div>
    );
}
