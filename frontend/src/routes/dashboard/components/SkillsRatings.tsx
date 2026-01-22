import { useState } from 'react';
import { BookOpen, TrendingUp, TrendingDown, Plus, Target, ChevronRight, AlertTriangle, Award } from 'lucide-react';
import { useSkillsSummary } from '#data/skills';
import { useTrainingAssignments, type TrainingAssignment } from '#data/training-assignments';
import { useStartBattleCardTraining } from '#data/battle-cards';
import { useIsManager } from '#util/useRole';
import { TrainingAssignmentModal } from './TrainingAssignmentModal';
import { Link, useLocation } from 'wouter';

interface SkillsRatingsProps {
    salespersonId: string;
    repName?: string;
    embedded?: boolean; // If true, don't show card wrapper
}

/**
 * SkillsRatings Component
 *
 * Displays current skill assessments for a salesperson.
 * Uses the backend /skills/summary endpoint to show current week and month averages.
 * Managers can assign training for specific skills.
 * Shows assigned training badges on skills.
 *
 * Skills tracked (1-10 scale):
 * - Objection Handling
 * - Pricing Discussions
 * - Discovery & Features
 * - Closing
 *
 * Color coding:
 * - Green (8+): Strong performance
 * - Yellow (6-7): Needs improvement
 * - Red (<6): Requires attention
 */
export function SkillsRatings({ salespersonId, repName, embedded = false }: SkillsRatingsProps) {
    const { data: skillsSummary, isPending, error } = useSkillsSummary(salespersonId);
    const { data: assignments } = useTrainingAssignments(salespersonId);
    const isManager = useIsManager();
    const [, navigate] = useLocation();

    const [assignmentModal, setAssignmentModal] = useState<{
        isOpen: boolean;
        skillName: string;
    } | null>(null);

    // Hook to start battle card training (generates scenario if needed)
    const { mutate: startBattleCardTraining, isPending: isStartingTraining } = useStartBattleCardTraining();

    // Handler for clicking on an assigned skill - goes to the specific training
    const handleAssignedSkillClick = (assignment: TrainingAssignment, skillKey: string) => {
        if (assignment.trainingType === 'battle_card' && assignment.trainingId) {
            // Start the battle card training (generates scenario if needed)
            const numericId = parseInt(assignment.trainingId, 10);
            if (!isNaN(numericId)) {
                startBattleCardTraining(numericId, {
                    onSuccess: (data) => {
                        if (data.scenario) {
                            navigate(`/salesperson/${salespersonId}/training/${data.scenario.id}`);
                        }
                    },
                });
            }
        } else if (assignment.trainingType === 'scenario') {
            // For skill-based assignments, trainingId is the skill name (e.g., "Pricing Discussions")
            // Navigate to the skill training page where they can select a scenario
            navigate(`/salesperson/${salespersonId}/skills/${skillKey}`);
        }
    };

    // Helper to get color classes for skill rating badges
    const getSkillBadgeClass = (rating: number | null): string => {
        if (rating === null) return 'badge-ghost';
        if (rating >= 8) return 'badge-success';
        if (rating >= 6) return 'badge-warning';
        return 'badge-error';
    };

    // Helper to determine if trending up or down (compare week to month)
    const getTrendIcon = (weekScore: number | null, monthScore: number | null) => {
        if (weekScore === null || monthScore === null) return null;
        if (weekScore > monthScore) return <TrendingUp className="h-3 w-3 text-success" />;
        if (weekScore < monthScore) return <TrendingDown className="h-3 w-3 text-error" />;
        return null;
    };

    if (isPending) {
        return (
            <div className="card bg-base-200 border border-base-content/30 shadow-sm">
                <div className="card-body">
                    <div className="flex items-center gap-2 mb-4">
                        <Award className="h-5 w-5 text-primary" />
                        <h3 className="card-title text-lg">Skills Assessment</h3>
                    </div>
                    <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-md"></span>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card bg-base-200 border border-base-content/30">
                <div className="card-body">
                    <div className="flex items-center gap-2 mb-4">
                        <Award className="h-5 w-5 text-primary" />
                        <h3 className="card-title text-lg">Skills Assessment</h3>
                    </div>
                    <div className="alert alert-error">
                        <span>Error loading skills data</span>
                    </div>
                </div>
            </div>
        );
    }

    const currentMonth = skillsSummary?.currentMonth;
    const currentWeek = skillsSummary?.currentWeek;

    // Use month data as primary (more stable), with week for trends
    const skills = [
        {
            label: 'Objection Handling',
            key: 'objection_handling',
            monthScore: currentMonth?.objectionHandling,
            weekScore: currentWeek?.objectionHandling,
        },
        {
            label: 'Pricing Discussions',
            key: 'pricing_discussions',
            monthScore: currentMonth?.pricingDiscussions,
            weekScore: currentWeek?.pricingDiscussions,
        },
        {
            label: 'Discovery & Features',
            key: 'discovery',
            monthScore: currentMonth?.discovery,
            weekScore: currentWeek?.discovery,
        },
        {
            label: 'Closing',
            key: 'closing',
            monthScore: currentMonth?.closing,
            weekScore: currentWeek?.closing,
        },
    ];

    const hasAnyData = skills.some((s) => s.monthScore !== null || s.weekScore !== null);

    // Helper to check if a skill has an assignment
    const getSkillAssignment = (skillLabel: string) => {
        return assignments?.find((a) => a.title?.includes(skillLabel) && a.status !== 'completed');
    };

    // Separate skills into assigned and available
    const assignedSkills = skills.filter((skill) => getSkillAssignment(skill.label));
    const availableSkills = skills.filter((skill) => !getSkillAssignment(skill.label));

    const renderSkill = (skill: (typeof skills)[0], isAssigned: boolean, index: number) => {
        const primaryScore = skill.monthScore ?? skill.weekScore ?? null;
        const trendIcon = getTrendIcon(skill.weekScore ?? null, skill.monthScore ?? null);
        const assignment = getSkillAssignment(skill.label);

        const skillContent = (
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1">
                    <div className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                        {isAssigned ? (
                            <Target className="h-5 w-5 text-warning flex-shrink-0" />
                        ) : (
                            <BookOpen className="h-5 w-5 text-info flex-shrink-0" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm group-hover:text-primary transition-colors duration-200">{skill.label}</h4>
                            {assignment && (
                                <>
                                    {assignment.priority === 'high' && <span className="badge badge-error badge-xs">High Priority</span>}
                                    {assignment.priority === 'normal' && <span className="badge badge-info badge-xs">Normal</span>}
                                </>
                            )}
                            {isStartingTraining && assignment && <span className="loading loading-spinner loading-xs"></span>}
                        </div>
                        {assignment && (
                            <div className="text-xs text-base-content/70 group-hover:text-base-content/80 transition-colors duration-200 mt-1">
                                <p>Assigned: {new Date(assignment.createdAt).toLocaleDateString()}</p>
                                {assignment.dueDate && <p>Due: {new Date(assignment.dueDate).toLocaleDateString()}</p>}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {primaryScore !== null && primaryScore !== undefined ? (
                        <div className="flex items-center gap-2">
                            <span className={`badge ${getSkillBadgeClass(primaryScore)} badge-sm font-semibold min-w-[3.5rem]`}>
                                {primaryScore.toFixed(1)}/10
                            </span>
                            {trendIcon}
                        </div>
                    ) : (
                        <span className="badge badge-ghost badge-sm">N/A</span>
                    )}
                    {isManager && !assignment && (
                        <button
                            type="button"
                            className="btn btn-xs btn-primary opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAssignmentModal({ isOpen: true, skillName: skill.label });
                            }}
                            title="Assign Training"
                        >
                            <Plus className="h-3 w-3" />
                            Assign
                        </button>
                    )}
                    <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {isAssigned ? 'Continue' : 'Start'}
                    </div>
                    <ChevronRight
                        className={`h-4 w-4 text-base-content/70 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200`}
                    />
                </div>
            </div>
        );

        // For assigned skills, use a button that navigates to the specific training
        if (isAssigned && assignment) {
            return (
                <button
                    key={skill.label}
                    type="button"
                    disabled={isStartingTraining}
                    className={`group relative p-3 rounded-lg border animate-fade-in-up w-full text-left
                        border-warning/30 hover:border-warning/50 hover:bg-base-200/80
                        hover:shadow-md transition-all duration-200 cursor-pointer
                        ${isStartingTraining ? 'opacity-70' : ''}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => handleAssignedSkillClick(assignment, skill.key)}
                >
                    {skillContent}
                </button>
            );
        }

        // For unassigned skills, use a Link to the skill training page
        return (
            <div
                key={skill.label}
                className={`group relative p-3 rounded-lg border animate-fade-in-up
                    border-base-300 hover:border-primary/30 hover:bg-base-200/80
                    hover:shadow-md transition-all duration-200 cursor-pointer`}
                style={{ animationDelay: `${index * 50}ms` }}
            >
                <Link to={`/salesperson/${salespersonId}/skills/${skill.key}`} className="block">
                    {skillContent}
                </Link>
            </div>
        );
    };

    const content = (
        <>
            {!embedded && (
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <h3 className="card-title text-lg">Skills Assessment{repName ? ` - ${repName}` : ''}</h3>
                    </div>
                </div>
            )}
            {embedded && <div className="text-sm font-medium mb-3">Skills Assessment</div>}

            {!hasAnyData ? (
                <div className="text-center py-8 text-base-content/60">
                    <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No skills assessments yet</p>
                    <p className="text-xs mt-1">Skills are evaluated from call recordings</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Available Skills Section */}
                    {availableSkills.length > 0 && (
                        <div className="space-y-3">
                            {availableSkills.map((skill, index) => renderSkill(skill, false, index))}
                            <div className="text-xs text-base-content/60 text-center pt-2">
                                Click on any skill to start training
                                {isManager && ' - Hover to assign training'}
                            </div>
                        </div>
                    )}

                    {/* Assigned Training Section */}
                    {assignedSkills.length > 0 && (
                        <div className="border-t pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Target className="h-4 w-4 text-warning" />
                                <h4 className="text-sm font-semibold">Assigned Training</h4>
                                <AlertTriangle className="h-3 w-3 text-error" />
                                <span className="badge badge-sm px-1.5 py-0.5 text-xs">{assignedSkills.length}</span>
                            </div>
                            <div className="space-y-3">{assignedSkills.map((skill, index) => renderSkill(skill, true, index))}</div>
                        </div>
                    )}

                    {/* Period indicator */}
                    <div className="text-xs text-base-content/60 text-center pt-3 border-t border-base-300">
                        {currentMonth?.callCount ? (
                            <span>
                                Based on {currentMonth.callCount} call{currentMonth.callCount !== 1 ? 's' : ''} this month
                            </span>
                        ) : currentWeek?.callCount ? (
                            <span>
                                Based on {currentWeek.callCount} call{currentWeek.callCount !== 1 ? 's' : ''} this week
                            </span>
                        ) : (
                            <span>No recent calls</span>
                        )}
                    </div>
                </div>
            )}
        </>
    );

    return (
        <>
            {embedded ? (
                content
            ) : (
                <div className="card bg-base-200 border border-base-content/30">
                    <div className="card-body">{content}</div>
                </div>
            )}

            {/* Training Assignment Modal */}
            {assignmentModal && (
                <TrainingAssignmentModal
                    isOpen={assignmentModal.isOpen}
                    onClose={() => setAssignmentModal(null)}
                    salespersonId={Number(salespersonId)}
                    salespersonName={repName ?? 'Salesperson'}
                    skillName={assignmentModal.skillName}
                />
            )}
        </>
    );
}
