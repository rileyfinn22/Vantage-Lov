import { Star, Flag as FlagIcon, Database, Loader2, Trash2 } from 'lucide-react';
import { formatDateTime } from '#util';
import InteractionFiles from './InteractionFiles';
import InteractionRatingsFloatingUI from './InteractionRatingsFloatingUI';
import InteractionFlagsFloatingUI from './InteractionFlagsFloatingUI';
import InteractionMetadataFloatingUI from './InteractionMetadataFloatingUI';
import { InteractionDetailButton } from './InteractionDetailButton';
import type { InteractionWithRelationsAPI } from './useInteractionsWithRelations';
import { ho } from '#data/client';
import { useState } from 'react';

interface InteractionLineItemProps {
    interaction: InteractionWithRelationsAPI;
    onDelete?: () => void;
}

// Helper component for ratings button with floating UI
const RatingsButton = ({
    interactionId,
    count,
    ratings,
    skillsAssessments,
}: {
    interactionId: number;
    count: number;
    ratings: InteractionWithRelationsAPI['ratings'];
    skillsAssessments: InteractionWithRelationsAPI['skillsAssessments'];
}) => {
    return (
        <InteractionDetailButton count={count} label="Ratings" Icon={Star} maxWidth="max-w-3xl">
            {({ onClose }) => (
                <InteractionRatingsFloatingUI
                    ratings={ratings}
                    skillsAssessments={skillsAssessments}
                    interactionId={interactionId}
                    onClose={onClose}
                />
            )}
        </InteractionDetailButton>
    );
};

// Helper component for flags button with floating UI
const FlagsButton = ({
    interactionId,
    count,
    flags,
}: {
    interactionId: number;
    count: number;
    flags: InteractionWithRelationsAPI['flags'];
}) => {
    return (
        <InteractionDetailButton count={count} label="Flags" Icon={FlagIcon} maxWidth="max-w-4xl">
            {({ onClose }) => <InteractionFlagsFloatingUI flags={flags} interactionId={interactionId} onClose={onClose} />}
        </InteractionDetailButton>
    );
};

const InteractionLineItem = ({ interaction, onDelete }: InteractionLineItemProps) => {
    // Extract pre-loaded ratings, flags, bigfiles, and skillsAssessments from the interaction
    const ratings = interaction.ratings ?? [];
    const flags = interaction.flags ?? [];
    const bigfiles = interaction.bigfiles ?? [];
    const skillsAssessments = interaction.skillsAssessments ?? [];
    const ratingsCount = ratings.length;
    const flagsCount = flags.length;
    const isProcessing = interaction.processedStatus === 'processing';

    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const response = await ho.vantage.api.admin.interactions[':id'].$delete({
                param: { id: String(interaction.id) },
            });
            if (response.ok) {
                onDelete?.();
            } else {
                console.error('Failed to delete interaction');
            }
        } catch (error) {
            console.error('Error deleting interaction:', error);
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        <div className="rounded-lg border border-base-300 bg-base-100 p-3 space-y-2 shadow-sm">
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="font-semibold">Interaction #{interaction.id}</div>
                        {isProcessing && (
                            <div className="flex items-center gap-1 text-primary">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span className="text-xs">Processing...</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-base-content/50 shrink-0">{formatDateTime(interaction.createdAt)}</div>
                        {showDeleteConfirm ? (
                            <div className="flex items-center gap-1">
                                <button className="btn btn-error btn-xs" onClick={handleDelete} disabled={isDeleting}>
                                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                                </button>
                                <button className="btn btn-ghost btn-xs" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                                onClick={() => setShowDeleteConfirm(true)}
                                title="Delete interaction"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-xs text-base-content/80" title={interaction.blurb}>
                    {interaction.blurb}
                </div>
                <div className="flex items-center gap-1">
                    <RatingsButton
                        interactionId={interaction.id}
                        count={ratingsCount}
                        ratings={ratings}
                        skillsAssessments={skillsAssessments}
                    />
                    <FlagsButton interactionId={interaction.id} count={flagsCount} flags={flags} />
                    <InteractionDetailButton
                        count={interaction.metadata ? 1 : 0}
                        label="Metadata"
                        Icon={Database}
                        maxWidth="max-w-2xl"
                        alwaysShow={bigfiles.length > 0}
                        missingLabel="Missing Metadata"
                    >
                        {({ onClose }) => (
                            <InteractionMetadataFloatingUI
                                interactionId={interaction.id}
                                metadata={interaction.metadata}
                                onClose={onClose}
                            />
                        )}
                    </InteractionDetailButton>
                </div>
            </div>
            <InteractionFiles interactionId={interaction.id} bigfiles={bigfiles} interaction={interaction} />
        </div>
    );
};

export default InteractionLineItem;
