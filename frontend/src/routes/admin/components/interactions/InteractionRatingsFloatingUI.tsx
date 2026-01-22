import { formatDateShort } from '#util';
import type { InteractionWithRelationsAPI } from './useInteractionsWithRelations';

interface InteractionRatingsFloatingUIProps {
    interactionId: number;
    ratings: InteractionWithRelationsAPI['ratings'];
    skillsAssessments: InteractionWithRelationsAPI['skillsAssessments'];
    onClose: () => void;
}

const InteractionRatingsFloatingUI = ({ interactionId, ratings, skillsAssessments, onClose }: InteractionRatingsFloatingUIProps) => {
    // Get the first (latest) skills assessment if available
    const latestSkillsAssessment = skillsAssessments?.[0];

    return (
        <div className="flex h-full flex-col gap-2 p-4 relative">
            <div className="flex items-center justify-between gap-2 border-b border-base-300 pb-2">
                <div>
                    <h3 className="text-lg font-semibold">Ratings & Skills</h3>
                    <p className="text-xs text-base-content/60">
                        Interaction #{interactionId} • {ratings.length} rating{ratings.length === 1 ? '' : 's'}
                    </p>
                </div>
                <button onClick={onClose} className="btn btn-xs btn-ghost" aria-label="Close dialog">
                    ✕
                </button>
            </div>

            {ratings.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/40">
                    <p className="px-4 py-8 text-center text-sm text-base-content/60">No ratings found</p>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden rounded-lg border border-base-300 bg-base-200/40">
                    <div className="h-full overflow-y-auto p-2 space-y-3">
                        {ratings.map((rating) => (
                            <div key={rating.id} className="rounded-lg border border-base-300 bg-base-100 p-3 space-y-3 shadow-sm">
                                {/* Overall Rating */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="text-2xl font-bold text-primary">{rating.value}</div>
                                        <div className="text-xs text-base-content/60">/ 100</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="badge badge-sm badge-outline">{rating.type}</span>
                                        {rating.createdAt && (
                                            <span className="text-xs text-base-content/50">{formatDateShort(rating.createdAt)}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Skills Breakdown */}
                                {latestSkillsAssessment && (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="text-xs">
                                                <span className="text-base-content/60">Discovery:</span>
                                                <span className="ml-1 font-semibold">
                                                    {latestSkillsAssessment.discoveryFeaturesScore}/10
                                                </span>
                                            </div>
                                            <div className="text-xs">
                                                <span className="text-base-content/60">Objection Handling:</span>
                                                <span className="ml-1 font-semibold">
                                                    {latestSkillsAssessment.objectionHandlingScore}/10
                                                </span>
                                            </div>
                                            <div className="text-xs">
                                                <span className="text-base-content/60">Pricing:</span>
                                                <span className="ml-1 font-semibold">
                                                    {latestSkillsAssessment.pricingDiscussionsScore}/10
                                                </span>
                                            </div>
                                            <div className="text-xs">
                                                <span className="text-base-content/60">Closing:</span>
                                                <span className="ml-1 font-semibold">{latestSkillsAssessment.closingScore}/10</span>
                                            </div>
                                        </div>

                                        {/* Call Type */}
                                        {latestSkillsAssessment.assessmentData?.call_context?.inferred_call_type && (
                                            <div className="text-xs">
                                                <span className="badge badge-sm badge-outline">
                                                    {latestSkillsAssessment.assessmentData.call_context.inferred_call_type}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Blurb */}
                                <div className="text-sm text-base-content/80">{rating.blurb}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractionRatingsFloatingUI;
