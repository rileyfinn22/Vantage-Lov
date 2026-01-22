import { useState } from 'react';
import { useCreate } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';

interface AddInteractionButtonProps {
    salespersonId: number;
    onInteractionAdded: () => void;
}

const AddInteractionButton = ({ salespersonId, onInteractionAdded }: AddInteractionButtonProps) => {
    const [blurb, setBlurb] = useState('');

    const {
        mutate: createInteraction,
        mutation: { isPending: isCreating },
    } = useCreate();

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
                    addNotification('Interaction created successfully', 'success');
                    onInteractionAdded();
                },
                onError: (error) => {
                    console.error('Error creating interaction:', error);
                    addNotification('Failed to create interaction', 'error');
                },
            },
        );
    };

    return (
        <div className="space-y-3">
            <h4 className="font-medium">Add New Interaction</h4>
            <textarea
                className="textarea textarea-bordered w-full"
                placeholder="Enter interaction description..."
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
                rows={3}
            />
            <button className="btn btn-primary btn-sm w-full" onClick={handleCreateInteraction} disabled={isCreating || !blurb.trim()}>
                {isCreating ? (
                    <>
                        <span className="loading loading-spinner loading-xs"></span>
                        Creating...
                    </>
                ) : (
                    'Create Interaction'
                )}
            </button>
        </div>
    );
};

export default AddInteractionButton;
