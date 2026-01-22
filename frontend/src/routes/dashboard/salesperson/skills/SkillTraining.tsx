import { useRoute, useLocation, Link } from 'wouter';
import { ArrowLeft, BookOpen, DollarSign, Search, Target, Clock, Users } from 'lucide-react';
import { useTrainingScenarios } from '#data/training';
import { useSalesPersonData } from '#data/fetchers';
import { getPortraitForName } from '#util/portraits';
import { getDifficultyBadgeClass } from '#util/badges';

const SKILL_CONFIG: Record<string, { title: string; description: string; icon: typeof BookOpen; colorClass: string }> = {
    objection_handling: {
        title: 'Objection Handling',
        description: 'Master the art of addressing customer concerns and turning objections into opportunities',
        icon: BookOpen,
        colorClass: 'text-info',
    },
    pricing_discussions: {
        title: 'Pricing Discussions',
        description: 'Navigate pricing conversations with confidence and maximize deal value',
        icon: DollarSign,
        colorClass: 'text-success',
    },
    discovery: {
        title: 'Discovery & Features',
        description: 'Master discovery questioning and effectively present features that matter',
        icon: Search,
        colorClass: 'text-primary',
    },
    closing: {
        title: 'Closing',
        description: 'Perfect your closing skills and confidently ask for the business',
        icon: Target,
        colorClass: 'text-error',
    },
};

/**
 * SkillTraining Component
 *
 * Displays available training scenarios for a specific skill.
 * Users can browse scenarios and start training sessions.
 *
 * Route: /dashboard/salesperson/:id/skills/:skillKey
 *
 * Features:
 * - Fetches scenarios from backend via useTrainingScenarios hook
 * - Displays scenarios in a responsive grid layout
 * - Shows scenario details: difficulty, duration, participants, objectives
 * - Navigates to training roleplay interface when scenario is started
 */
export function SkillTraining() {
    const [, params] = useRoute('/salesperson/:id/skills/:skillKey');
    const [, setLocation] = useLocation();
    const salespersonId = params?.id ?? '';
    const skillKey = params?.skillKey ?? '';

    const { data: salespersonData, isPending: salespersonLoading } = useSalesPersonData(salespersonId);
    const { data: scenariosData, isPending: scenariosLoading, error } = useTrainingScenarios(skillKey);

    const skillConfig = SKILL_CONFIG[skillKey];
    const SkillIcon = skillConfig?.icon ?? BookOpen;

    const repName = salespersonData?.salesperson ? `${salespersonData.salesperson.firstName} ${salespersonData.salesperson.lastName}` : '';

    // Handle starting a training scenario
    const handleStartScenario = (scenarioId: string) => {
        setLocation(`/salesperson/${salespersonId}/training/${scenarioId}`);
    };

    // Loading state
    if (salespersonLoading || scenariosLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link to={`/salesperson/${salespersonId}`}>
                        <button type="button" className="btn btn-ghost btn-sm">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">{skillConfig?.title ?? 'Skill Training'}</h1>
                        <p className="text-sm text-base-content/60">{repName}</p>
                    </div>
                </div>
                <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link to={`/salesperson/${salespersonId}`}>
                        <button type="button" className="btn btn-ghost btn-sm">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">{skillConfig?.title ?? 'Skill Training'}</h1>
                        <p className="text-sm text-base-content/60">{repName}</p>
                    </div>
                </div>
                <div className="alert alert-error">
                    <span>Error loading training scenarios. Please try again.</span>
                </div>
            </div>
        );
    }

    // Invalid skill error
    if (!skillConfig) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link to={`/salesperson/${salespersonId}`}>
                        <button type="button" className="btn btn-ghost btn-sm">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </button>
                    </Link>
                </div>
                <div className="alert alert-warning">
                    <span>Skill not found. Please select a valid skill.</span>
                </div>
            </div>
        );
    }

    const scenarios = scenariosData?.scenarios ?? [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href={`/dashboard/salesperson/${salespersonId}`}>
                    <button type="button" className="btn btn-ghost btn-sm">
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </button>
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <SkillIcon className={`h-6 w-6 ${skillConfig.colorClass}`} />
                        <h1 className="text-2xl font-bold">{skillConfig.title}</h1>
                    </div>
                    <p className="text-sm text-base-content/60 mt-1">
                        {repName ? `Training scenarios for ${repName}` : 'Select a scenario to begin training'}
                    </p>
                </div>
            </div>

            {/* Empty state */}
            {scenarios.length === 0 ? (
                <div className="card bg-base-200 border border-base-content/30">
                    <div className="card-body">
                        <div className="text-center py-12 text-base-content/60">
                            <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-30" />
                            <p className="text-lg font-medium mb-2">No training scenarios found</p>
                            <p className="text-sm">Training scenarios for this skill are being prepared. Check back soon!</p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Scenarios Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {scenarios.map((scenario, index) => (
                            <div
                                key={scenario.scenarioId}
                                className="card bg-base-200 border border-base-content/30 hover:shadow-md hover:border-primary/30 transition-all duration-200 animate-fade-in-up"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className="card-body">
                                    {/* Scenario Header */}
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <h3 className="card-title text-base">{scenario.title}</h3>
                                        <span className={`badge ${getDifficultyBadgeClass(scenario.difficulty)} badge-sm flex-shrink-0`}>
                                            {scenario.difficulty}
                                        </span>
                                    </div>

                                    {/* Meta info */}
                                    <div className="flex items-center gap-4 text-sm text-base-content/60 mb-4">
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-4 w-4" />
                                            <span>{scenario.duration}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Users className="h-4 w-4" />
                                            <span>{scenario.participants} participants</span>
                                        </div>
                                    </div>

                                    {/* Prospect Info */}
                                    {scenario.prospectData && (
                                        <div className="flex items-start gap-3 p-3 bg-base-200/50 rounded-lg mb-4">
                                            <div className="avatar">
                                                <div className="w-10 h-10 rounded-full">
                                                    <img
                                                        src={getPortraitForName(scenario.prospectData.name ?? 'Prospect')}
                                                        alt={scenario.prospectData.name ?? 'Prospect'}
                                                        className="object-cover"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm">{scenario.prospectData.name ?? 'Prospect'}</div>
                                                {scenario.prospectData.role && scenario.prospectData.company && (
                                                    <div className="text-xs text-base-content/60">
                                                        {scenario.prospectData.role} at {scenario.prospectData.company}
                                                    </div>
                                                )}
                                                {scenario.prospectData.personality && (
                                                    <div className="text-xs text-base-content/50 mt-1 italic">
                                                        {scenario.prospectData.personality}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Context */}
                                    {scenario.context && (
                                        <div className="mb-4">
                                            <p className="text-sm text-base-content/80">{scenario.context}</p>
                                        </div>
                                    )}

                                    {/* Objectives */}
                                    {scenario.objectives && scenario.objectives.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="text-sm font-semibold mb-2">Training Objectives</h4>
                                            <ul className="space-y-1 text-sm text-base-content/70">
                                                {scenario.objectives.slice(0, 2).map((objective, index) => (
                                                    <li key={index} className="flex items-start gap-2">
                                                        <span className="text-primary mt-0.5">•</span>
                                                        <span>{objective}</span>
                                                    </li>
                                                ))}
                                                {scenario.objectives.length > 2 && (
                                                    <li className="text-xs text-base-content/50 pl-4">
                                                        +{scenario.objectives.length - 2} more objective
                                                        {scenario.objectives.length - 2 !== 1 ? 's' : ''}
                                                    </li>
                                                )}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Start Button */}
                                    <button
                                        type="button"
                                        className="btn btn-primary w-full mt-2"
                                        onClick={() => handleStartScenario(scenario.scenarioId)}
                                    >
                                        Start Training Scenario
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Coming Soon Card */}
                    <div className="card border-2 border-dashed border-base-300/50 bg-base-100/50">
                        <div className="card-body text-center py-8">
                            <div className="text-base-content/40">
                                <Target className="h-8 w-8 mx-auto mb-3 opacity-50" />
                                <h3 className="font-medium mb-2">More Scenarios Coming Soon</h3>
                                <p className="text-sm">
                                    Our AI is continuously analyzing your organization's sales calls to create new, personalized training
                                    scenarios. Check back regularly for fresh content.
                                </p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
