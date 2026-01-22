import { useState, useEffect } from 'react';
import { useList, useUpdate, useCreate, useDelete } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import { AlertCircle, Info } from 'lucide-react';
import { ho } from '#/data/client';

type PromptKey = 'rating' | 'flagging' | 'extraction' | 'call_persona' | 'training_skills' | 'training_battle_card';

interface PromptSetting {
    id: number;
    key: PromptKey;
    value: any;
    createdAt: string;
    updatedAt: string;
}

interface DefaultPrompts {
    rating: string;
    flagging: string;
    extraction: string;
    call_persona: string;
    training_skills: string;
    training_battle_card: string;
}

const PROMPT_CONFIG: Record<
    PromptKey,
    {
        title: string;
        description: string;
        category: 'analysis' | 'training';
        badge?: string;
        badgeClass?: string;
    }
> = {
    rating: {
        title: 'Rating Prompt (Skills Assessment)',
        description:
            'Evaluates calls with overall rating (1-100) and 4 skills scores. Runs first in the analysis pipeline, writing to cache.',
        category: 'analysis',
        badge: '1st API call - cache write',
        badgeClass: 'badge-primary',
    },
    flagging: {
        title: 'Flagging Prompt (Coaching Moments)',
        description:
            'VP of Sales-style analysis for identifying high-impact coaching moments. Uses multi-stage evaluation with holistic observation, outcome gates, and pattern recognition.',
        category: 'analysis',
        badge: '2nd API call - cache hit',
        badgeClass: 'badge-secondary',
    },
    extraction: {
        title: 'Extraction Prompt (Objections, Pain Points & Battle Cards)',
        description:
            'Extracts objections and pain points with timestamps, PLUS generates battle cards for significant items. Outputs two separate JSON blocks: extractions and battle_cards.',
        category: 'analysis',
        badge: '3rd API call - cache hit',
        badgeClass: 'badge-secondary',
    },
    call_persona: {
        title: 'Call Persona + Flag Roleplay Prompt',
        description:
            'Runs on EVERY call. Extracts psychological persona AND generates ElevenLabs-ready roleplay prompts for each flag (eliminates per-flag API calls).',
        category: 'analysis',
        badge: '4th API call - cache hit',
        badgeClass: 'badge-accent',
    },
    training_skills: {
        title: 'Training: Skills Assessment Roleplay',
        description:
            'General skill building. SYNTHESIZES personas from call_personas library to create realistic, industry-grounded roleplay (Objection Handling, Pricing, Discovery, Closing).',
        category: 'training',
    },
    training_battle_card: {
        title: 'Training: Battle Card Practice Roleplay',
        description:
            'Practicing battle card scenarios. SYNTHESIZES personas from library + battle card data for focused, realistic practice.',
        category: 'training',
    },
};

const SystemPromptSettings = () => {
    const [promptValues, setPromptValues] = useState<Record<PromptKey, string>>({
        rating: '',
        flagging: '',
        extraction: '',
        call_persona: '',
        training_skills: '',
        training_battle_card: '',
    });
    const [isModified, setIsModified] = useState(false);
    const [defaultPrompts, setDefaultPrompts] = useState<DefaultPrompts | null>(null);

    const { query, result } = useList<PromptSetting>({
        resource: 'system_prompt_settings',
    });

    const { mutate: updateSetting } = useUpdate();
    const { mutate: createSetting } = useCreate();
    const { mutate: deleteSetting } = useDelete();

    // Fetch default prompts on mount
    useEffect(() => {
        const fetchDefaults = async () => {
            try {
                const res = await ho.vantage.api['prompt-defaults'].$get();
                if (res.ok) {
                    const data = await res.json();
                    setDefaultPrompts(data);
                } else {
                    console.error('Failed to fetch default prompts:', res.status, res.statusText);
                }
            } catch (error) {
                console.error('Failed to fetch default prompts:', error);
            }
        };
        fetchDefaults();
    }, []);

    // Load values when data is fetched (but don't overwrite unsaved changes)
    useEffect(() => {
        if (result.data && !isModified) {
            const settings = result.data as PromptSetting[];
            const newValues: Record<PromptKey, string> = {
                rating: '',
                flagging: '',
                extraction: '',
                call_persona: '',
                training_skills: '',
                training_battle_card: '',
            };
            for (const setting of settings) {
                const valueStr = typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value, null, 2);
                if (setting.key in newValues) {
                    newValues[setting.key as PromptKey] = valueStr;
                }
            }
            setPromptValues(newValues);
        }
    }, [result.data, isModified]);

    const handleSave = async () => {
        try {
            const settings = result.data as PromptSetting[];
            const allKeys = Object.keys(promptValues) as PromptKey[];

            const allItems = allKeys.map((key) => ({
                key,
                value: promptValues[key],
            }));

            // Split into updates/creates and deletes
            const updatesAndCreates = allItems.filter((item) => item.value.length > 1);
            const deletes = allItems.filter((item) => {
                const existingSetting = settings.find((s) => s.key === item.key);
                return item.value.length <= 1 && existingSetting;
            });

            // Process updates and creates
            for (const update of updatesAndCreates) {
                const existingSetting = settings.find((s) => s.key === update.key);

                let parsedValue: string;
                try {
                    parsedValue = JSON.parse(update.value);
                } catch {
                    parsedValue = update.value;
                }

                if (existingSetting) {
                    await new Promise<void>((resolve, reject) => {
                        updateSetting(
                            {
                                resource: 'system_prompt_settings',
                                id: existingSetting.id,
                                values: {
                                    value: parsedValue,
                                },
                            },
                            {
                                onSuccess: () => resolve(),
                                onError: (error) => reject(error),
                            },
                        );
                    });
                } else {
                    await new Promise<void>((resolve, reject) => {
                        createSetting(
                            {
                                resource: 'system_prompt_settings',
                                values: {
                                    key: update.key,
                                    value: parsedValue,
                                },
                            },
                            {
                                onSuccess: () => resolve(),
                                onError: (error) => reject(error),
                            },
                        );
                    });
                }
            }

            // Process deletes
            for (const deleteItem of deletes) {
                const existingSetting = settings.find((s) => s.key === deleteItem.key);
                if (existingSetting) {
                    await new Promise<void>((resolve, reject) => {
                        deleteSetting(
                            {
                                resource: 'system_prompt_settings',
                                id: existingSetting.id,
                            },
                            {
                                onSuccess: () => resolve(),
                                onError: (error) => reject(error),
                            },
                        );
                    });
                }
            }

            addNotification('Prompt settings saved successfully', 'success');
            setIsModified(false);
            query.refetch();
        } catch (error: any) {
            addNotification(`Failed to save settings: ${error.message}`, 'error');
        }
    };

    const handleChange = (key: PromptKey, value: string) => {
        setIsModified(true);
        setPromptValues((prev) => ({ ...prev, [key]: value }));
    };

    // Helper to get display value and whether it's custom
    const getPromptDisplay = (key: PromptKey) => {
        const customValue = promptValues[key];
        const hasCustom = customValue.length > 1;
        const displayValue = hasCustom ? customValue : (defaultPrompts?.[key] ?? 'Loading default...');
        return { hasCustom, displayValue };
    };

    const renderPromptField = (key: PromptKey) => {
        const config = PROMPT_CONFIG[key];
        const { hasCustom, displayValue } = getPromptDisplay(key);

        return (
            <div className="form-control" key={key}>
                <label htmlFor={`${key}-prompt`} className="label">
                    <span className="label-text font-medium text-lg">{config.title}</span>
                    <div className="flex gap-2">
                        <span className={`badge badge-sm ${hasCustom ? 'badge-warning' : 'badge-success'}`}>
                            {hasCustom ? 'Custom' : 'Default'}
                        </span>
                        {config.badge && <span className={`badge badge-sm ${config.badgeClass ?? 'badge-ghost'}`}>{config.badge}</span>}
                    </div>
                </label>
                <textarea
                    id={`${key}-prompt`}
                    className={`textarea textarea-bordered w-full font-mono text-xs leading-relaxed ${!hasCustom ? 'textarea-ghost bg-base-200' : ''}`}
                    placeholder="Loading default prompt..."
                    value={displayValue}
                    onChange={(e) => handleChange(key, e.target.value)}
                    rows={hasCustom ? 25 : 8}
                />
                <label htmlFor={`${key}-prompt`} className="label">
                    <span className="label-text-alt">{config.description}</span>
                    {hasCustom && (
                        <button onClick={() => handleChange(key, '')} className="label-text-alt link link-error text-xs">
                            Reset to default
                        </button>
                    )}
                </label>
            </div>
        );
    };

    if (query.isLoading) {
        return (
            <div className="p-4">
                <div className="skeleton h-8 w-64 mb-4"></div>
                <div className="skeleton h-32 w-full mb-4"></div>
                <div className="skeleton h-32 w-full mb-4"></div>
                <div className="skeleton h-32 w-full mb-4"></div>
                <div className="skeleton h-32 w-full"></div>
            </div>
        );
    }

    if (query.error) {
        return (
            <div className="p-6">
                <div className="alert alert-error">
                    <AlertCircle className="h-5 w-5" />
                    <span>Error loading prompt settings: {query.error.message}</span>
                </div>
            </div>
        );
    }

    const analysisPrompts: PromptKey[] = ['rating', 'flagging', 'extraction', 'call_persona'];
    const trainingPrompts: PromptKey[] = ['training_skills', 'training_battle_card'];

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-bold">AI Prompt Settings</h2>
                    <p className="text-sm text-base-content/70 mt-1">
                        Customize how the AI analyzes sales calls and generates training scenarios. Currently using{' '}
                        <strong>6 prompts</strong> across the system.
                    </p>
                </div>
                <button onClick={handleSave} className={`btn ${isModified ? 'btn-primary' : 'btn-ghost'}`} disabled={!isModified}>
                    {isModified ? 'Save Changes' : 'No Changes'}
                </button>
            </div>

            <div className="alert alert-info mb-6">
                <Info className="h-5 w-5" />
                <div>
                    <h3 className="font-semibold">How It Works</h3>
                    <p className="text-sm">
                        <strong>Analysis (4 prompts on transcript):</strong> rating (cache write) &rarr; flagging (cache hit) &rarr;
                        extraction + call_persona (parallel cache hits). The call_persona step now also generates ElevenLabs roleplay
                        prompts for each flag (no extra API calls).
                        <br />
                        <strong>Training (2 prompts):</strong> Use PRE-EXTRACTED data, not transcript. training_skills and
                        training_battle_card SYNTHESIZE realistic personas from the call_personas library.
                    </p>
                </div>
            </div>

            {/* Analysis Prompts Section */}
            <div className="mb-8">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <span className="badge badge-lg badge-primary">Analysis</span>
                    Call Transcript Processing
                </h3>
                <div className="space-y-6">{analysisPrompts.map((key) => renderPromptField(key))}</div>
            </div>

            <div className="divider"></div>

            {/* Training Prompts Section */}
            <div className="mb-8">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <span className="badge badge-lg badge-secondary">Training</span>
                    Roleplay Generation (Psychological Persona)
                </h3>
                <div className="space-y-6">{trainingPrompts.map((key) => renderPromptField(key))}</div>
            </div>
        </div>
    );
};

export default SystemPromptSettings;
