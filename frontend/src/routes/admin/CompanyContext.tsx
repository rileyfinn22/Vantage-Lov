import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle,
    BookOpen,
    Building2,
    CheckCircle2,
    Lightbulb,
    Phone,
    Plus,
    Save,
    Shield,
    Target,
    Trash2,
    TrendingUp,
    Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ho } from '#data/client';

interface CalibrationStatus {
    hasCalibrated: boolean;
    lastCalibrated?: string;
    patternsCount: {
        successPatterns: number;
        antiPatterns: number;
        salesLanguage: number;
        terminology: number;
    };
}

interface CompanyTrainingData {
    id?: number;
    companyId: number;
    onboardingDocument: string | null;
    exampleGoodCall: string | null;
    exampleBadCall: string | null;
    exampleAverageCall: string | null;
    idealResponses: Record<
        string,
        {
            ideal_response: string;
            key_points: string[];
        }
    > | null;
    objectionHandlingGuide: Record<
        string,
        {
            response_strategy: string;
            examples: string[];
        }
    > | null;
    productPositioning: string | null;
    competitorInfo: Record<
        string,
        {
            strengths: string[];
            weaknesses: string[];
            positioning: string;
        }
    > | null;
    companyValues: string[] | null;
    targetCustomerProfile: string | null;
    salesMethodology: string | null;
    companyFaq: string | null;
}

interface Company {
    id: number;
    name: string;
}

type TabKey = 'overview' | 'calls' | 'sales-guide' | 'objections' | 'competitors' | 'responses';

export default function CompanyContext() {
    const queryClient = useQueryClient();
    const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [formData, setFormData] = useState<Partial<CompanyTrainingData>>({});

    // Fetch all companies
    const { data: companies } = useQuery({
        queryKey: ['companies'],
        queryFn: async () => {
            const response = await ho.vantage.api.admin.crud[':resource'].$get({
                param: { resource: 'company' },
            });
            if (!response.ok) throw new Error('Failed to fetch companies');
            const data = await response.json();
            return data as Company[];
        },
    });

    // Fetch training data for selected company
    const { data: trainingData, isLoading } = useQuery({
        queryKey: ['company-training', selectedCompanyId],
        queryFn: async () => {
            if (!selectedCompanyId) return null;
            const response = await ho.vantage.api.admin['company-training'][':companyId'].$get({
                param: { companyId: selectedCompanyId.toString() },
            });
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error('Failed to fetch training data');
            }
            return response.json() as Promise<CompanyTrainingData>;
        },
        enabled: !!selectedCompanyId,
    });

    // Update form data when training data loads or company changes
    useEffect(() => {
        if (trainingData) {
            setFormData(trainingData);
        } else if (selectedCompanyId) {
            setFormData({
                companyId: selectedCompanyId,
                onboardingDocument: '',
                exampleGoodCall: '',
                exampleBadCall: '',
                exampleAverageCall: '',
                idealResponses: {},
                objectionHandlingGuide: {},
                productPositioning: '',
                competitorInfo: {},
                companyValues: [],
                targetCustomerProfile: '',
                salesMethodology: '',
                companyFaq: '',
            });
        }
    }, [trainingData, selectedCompanyId]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: async (data: Partial<CompanyTrainingData>) => {
            if (!selectedCompanyId) throw new Error('No company selected');

            const response = await ho.vantage.api.admin['company-training'][':companyId'].$put({
                param: { companyId: selectedCompanyId.toString() },
                json: data as any,
            });

            if (!response.ok) throw new Error('Failed to save training data');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['company-training', selectedCompanyId] });
        },
    });

    const handleSave = () => {
        saveMutation.mutate(formData);
    };

    const updateField = <K extends keyof CompanyTrainingData>(field: K, value: CompanyTrainingData[K]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // If no company selected, show company selector
    if (!selectedCompanyId) {
        return (
            <div className="p-6">
                <div className="bg-base-100 rounded-lg border border-base-300 p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-primary" />
                        <h2 className="text-xl font-semibold">Company Context & Training Data</h2>
                    </div>
                    <p className="text-sm text-base-content/70">
                        Select a company to configure their AI training context. This data is used to personalize AI analysis, training
                        scenarios, and coaching feedback.
                    </p>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Select Company</span>
                        </label>
                        <select
                            className="select select-bordered w-full max-w-md"
                            onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                            value=""
                        >
                            <option value="" disabled>
                                Choose a company...
                            </option>
                            {companies?.map((company) => (
                                <option key={company.id} value={company.id}>
                                    {company.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        );
    }

    const selectedCompany = companies?.find((c) => c.id === selectedCompanyId);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Company Context & Training Data</h2>
                    <p className="text-sm text-base-content/70">
                        Company: <span className="font-medium">{selectedCompany?.name}</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="btn btn-ghost" onClick={() => setSelectedCompanyId(null)}>
                        Change Company
                    </button>
                    <button className="btn btn-primary gap-2" onClick={handleSave} disabled={saveMutation.isPending}>
                        <Save className="h-4 w-4" />
                        {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Success/Error Messages */}
            {saveMutation.isSuccess && (
                <div className="alert alert-success">
                    <AlertCircle className="h-4 w-4" />
                    <span>Training data saved successfully!</span>
                </div>
            )}

            {saveMutation.isError && (
                <div className="alert alert-error">
                    <AlertCircle className="h-4 w-4" />
                    <span>Failed to save: {saveMutation.error?.message}</span>
                </div>
            )}

            {/* Tabs */}
            <div role="tablist" className="tabs tabs-boxed">
                <button
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'overview' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    <BookOpen className="h-4 w-4" />
                    Overview
                </button>
                <button
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'calls' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('calls')}
                >
                    <Phone className="h-4 w-4" />
                    Call Examples
                </button>
                <button
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'sales-guide' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('sales-guide')}
                >
                    <Target className="h-4 w-4" />
                    Sales Guide
                </button>
                <button
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'objections' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('objections')}
                >
                    <Shield className="h-4 w-4" />
                    Objection Handling
                </button>
                <button
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'competitors' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('competitors')}
                >
                    <TrendingUp className="h-4 w-4" />
                    Competitor Intel
                </button>
                <button
                    role="tab"
                    className={`tab gap-2 ${activeTab === 'responses' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('responses')}
                >
                    <Lightbulb className="h-4 w-4" />
                    Ideal Responses
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <>
                            <OverviewSection formData={formData} updateField={updateField} />
                        </>
                    )}

                    {/* Call Examples Tab */}
                    {activeTab === 'calls' && (
                        <>
                            <CallExamplesSection formData={formData} updateField={updateField} companyId={selectedCompanyId} />
                        </>
                    )}

                    {/* Sales Guide Tab */}
                    {activeTab === 'sales-guide' && (
                        <>
                            <SalesGuideSection formData={formData} updateField={updateField} />
                        </>
                    )}

                    {/* Objection Handling Tab */}
                    {activeTab === 'objections' && (
                        <>
                            <ObjectionHandlingSection formData={formData} updateField={updateField} />
                        </>
                    )}

                    {/* Competitor Intel Tab */}
                    {activeTab === 'competitors' && (
                        <>
                            <CompetitorIntelSection formData={formData} updateField={updateField} />
                        </>
                    )}

                    {/* Ideal Responses Tab */}
                    {activeTab === 'responses' && (
                        <>
                            <IdealResponsesSection formData={formData} updateField={updateField} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// Overview Section Component
function OverviewSection({
    formData,
    updateField,
}: {
    formData: Partial<CompanyTrainingData>;
    updateField: <K extends keyof CompanyTrainingData>(field: K, value: CompanyTrainingData[K]) => void;
}) {
    return (
        <>
            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Company FAQ</h3>
                    <p className="text-sm text-base-content/70">
                        Paste your comprehensive company FAQ document here. This will be used across all AI analysis and training to provide
                        context about your company, products, and services.
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full h-96"
                        placeholder="Paste company FAQ content from Word or other sources..."
                        value={formData.companyFaq ?? ''}
                        onChange={(e) => updateField('companyFaq', e.target.value)}
                    />
                </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Onboarding Document</h3>
                    <p className="text-sm text-base-content/70">
                        Company overview, mission statement, and key information for new sales reps
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full h-48"
                        placeholder="Enter company overview, mission, values, and onboarding information..."
                        value={formData.onboardingDocument ?? ''}
                        onChange={(e) => updateField('onboardingDocument', e.target.value)}
                    />
                </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Company Values</h3>
                    <p className="text-sm text-base-content/70">Core values that should guide sales conversations (comma-separated)</p>
                    <input
                        type="text"
                        className="input input-bordered w-full"
                        placeholder="e.g., Integrity, Customer First, Innovation..."
                        value={formData.companyValues?.join(', ') ?? ''}
                        onChange={(e) =>
                            updateField(
                                'companyValues',
                                e.target.value
                                    .split(',')
                                    .map((v) => v.trim())
                                    .filter(Boolean),
                            )
                        }
                    />
                </div>
            </div>
        </>
    );
}

// Call Examples Section Component
function CallExamplesSection({
    formData,
    updateField,
    companyId,
}: {
    formData: Partial<CompanyTrainingData>;
    updateField: <K extends keyof CompanyTrainingData>(field: K, value: CompanyTrainingData[K]) => void;
    companyId: number;
}) {
    const queryClient = useQueryClient();

    // Fetch calibration status
    const { data: calibrationStatus, isLoading: isLoadingStatus } = useQuery({
        queryKey: ['calibration-status', companyId],
        queryFn: async () => {
            const response = await ho.vantage.api.admin['company-training'][':companyId']['calibration-status'].$get({
                param: { companyId: companyId.toString() },
            });
            if (!response.ok) return null;
            return response.json() as Promise<CalibrationStatus>;
        },
        enabled: !!companyId,
    });

    // Calibration mutation
    const calibrateMutation = useMutation({
        mutationFn: async () => {
            const response = await ho.vantage.api.admin['company-training'][':companyId']['calibrate'].$post({
                param: { companyId: companyId.toString() },
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error((error as { error?: string }).error ?? 'Calibration failed');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calibration-status', companyId] });
        },
    });

    const hasExampleCalls = formData.exampleGoodCall || formData.exampleAverageCall || formData.exampleBadCall;

    return (
        <>
            {/* Calibration Status Card */}
            <div className="card bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 mb-6">
                <div className="card-body">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="card-title flex items-center gap-2">
                                <Zap className="h-5 w-5 text-primary" />
                                Pattern Calibration
                            </h3>
                            <p className="text-sm text-base-content/70 mt-1">
                                Extract patterns from example calls once, then use them for all future analysis (saves tokens and improves
                                accuracy)
                            </p>
                        </div>
                        <button
                            className="btn btn-primary gap-2"
                            onClick={() => calibrateMutation.mutate()}
                            disabled={calibrateMutation.isPending || !hasExampleCalls}
                        >
                            {calibrateMutation.isPending ? (
                                <>
                                    <span className="loading loading-spinner loading-sm"></span>
                                    Calibrating...
                                </>
                            ) : (
                                <>
                                    <Zap className="h-4 w-4" />
                                    Run Calibration
                                </>
                            )}
                        </button>
                    </div>

                    {/* Calibration Results */}
                    {calibrationStatus?.hasCalibrated && (
                        <div className="mt-4 pt-4 border-t border-base-300">
                            <div className="flex items-center gap-2 text-success mb-2">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="font-medium">Calibrated</span>
                                {calibrationStatus.lastCalibrated && (
                                    <span className="text-sm text-base-content/50">
                                        ({new Date(calibrationStatus.lastCalibrated).toLocaleDateString()})
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-4 text-sm">
                                <span className="badge badge-success badge-outline">
                                    {calibrationStatus.patternsCount.successPatterns} success patterns
                                </span>
                                <span className="badge badge-error badge-outline">
                                    {calibrationStatus.patternsCount.antiPatterns} anti-patterns
                                </span>
                                <span className="badge badge-info badge-outline">
                                    {calibrationStatus.patternsCount.salesLanguage} phrases
                                </span>
                                <span className="badge badge-secondary badge-outline">
                                    {calibrationStatus.patternsCount.terminology} terms
                                </span>
                            </div>
                        </div>
                    )}

                    {calibrateMutation.isSuccess && (
                        <div className="alert alert-success mt-4">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Calibration complete! Patterns extracted and stored for future analysis.</span>
                        </div>
                    )}

                    {calibrateMutation.isError && (
                        <div className="alert alert-error mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <span>{calibrateMutation.error?.message}</span>
                        </div>
                    )}

                    {!hasExampleCalls && (
                        <div className="alert alert-warning mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <span>Add at least one example call below, save it, then run calibration.</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="alert alert-info mb-6">
                <AlertCircle className="h-5 w-5" />
                <div>
                    <h3 className="font-semibold">Full Transcripts Welcome!</h3>
                    <p className="text-sm">
                        You can paste <strong>full transcripts</strong> here. When you click "Run Calibration", AI will extract the key
                        patterns and store them. These patterns (not full transcripts) are then used for every future analysis.
                    </p>
                </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title text-success">Example: Good Call Highlights</h3>
                    <p className="text-sm text-base-content/70">
                        Key excerpts from an exemplary sales call that demonstrate best practices (2-5 minute segments)
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full h-48"
                        placeholder="Paste key highlights from a good call here (not the full transcript)..."
                        value={formData.exampleGoodCall ?? ''}
                        onChange={(e) => updateField('exampleGoodCall', e.target.value)}
                    />
                </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title text-warning">Example: Average Call Highlights</h3>
                    <p className="text-sm text-base-content/70">Key excerpts from a typical sales call showing room for improvement</p>
                    <textarea
                        className="textarea textarea-bordered w-full h-48"
                        placeholder="Paste key highlights from an average call here..."
                        value={formData.exampleAverageCall ?? ''}
                        onChange={(e) => updateField('exampleAverageCall', e.target.value)}
                    />
                </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title text-error">Example: Bad Call Highlights</h3>
                    <p className="text-sm text-base-content/70">
                        Key excerpts that illustrate what to avoid (mistakes, missed opportunities)
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full h-48"
                        placeholder="Paste key highlights from a bad call here..."
                        value={formData.exampleBadCall ?? ''}
                        onChange={(e) => updateField('exampleBadCall', e.target.value)}
                    />
                </div>
            </div>
        </>
    );
}

// Sales Guide Section Component
function SalesGuideSection({
    formData,
    updateField,
}: {
    formData: Partial<CompanyTrainingData>;
    updateField: <K extends keyof CompanyTrainingData>(field: K, value: CompanyTrainingData[K]) => void;
}) {
    return (
        <>
            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Product Positioning</h3>
                    <p className="text-sm text-base-content/70">How reps should position and talk about your product or service</p>
                    <textarea
                        className="textarea textarea-bordered w-full h-48"
                        placeholder="Enter product positioning, key messaging, unique value proposition..."
                        value={formData.productPositioning ?? ''}
                        onChange={(e) => updateField('productPositioning', e.target.value)}
                    />
                </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Target Customer Profile (ICP)</h3>
                    <p className="text-sm text-base-content/70">Ideal customer profile: industry, company size, roles, pain points</p>
                    <textarea
                        className="textarea textarea-bordered w-full h-48"
                        placeholder="Enter ideal customer profile details..."
                        value={formData.targetCustomerProfile ?? ''}
                        onChange={(e) => updateField('targetCustomerProfile', e.target.value)}
                    />
                </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Sales Methodology</h3>
                    <p className="text-sm text-base-content/70">
                        Sales framework your team follows (e.g., MEDDIC, SPIN, Challenger, Sandler)
                    </p>
                    <input
                        type="text"
                        className="input input-bordered w-full"
                        placeholder="e.g., MEDDIC, SPIN Selling, Challenger Sale..."
                        value={formData.salesMethodology ?? ''}
                        onChange={(e) => updateField('salesMethodology', e.target.value)}
                    />
                </div>
            </div>
        </>
    );
}

// Objection Handling Section Component
function ObjectionHandlingSection({
    formData,
    updateField,
}: {
    formData: Partial<CompanyTrainingData>;
    updateField: <K extends keyof CompanyTrainingData>(field: K, value: CompanyTrainingData[K]) => void;
}) {
    const [newObjection, setNewObjection] = useState('');
    const [newStrategy, setNewStrategy] = useState('');
    const [newExample, setNewExample] = useState('');

    const objections = formData.objectionHandlingGuide ?? {};

    const addObjection = () => {
        if (!newObjection.trim() || !newStrategy.trim()) return;

        const updated = {
            ...objections,
            [newObjection]: {
                response_strategy: newStrategy,
                examples: newExample ? [newExample] : [],
            },
        };

        updateField('objectionHandlingGuide', updated);
        setNewObjection('');
        setNewStrategy('');
        setNewExample('');
    };

    const deleteObjection = (objection: string) => {
        const updated = { ...objections };
        delete updated[objection];
        updateField('objectionHandlingGuide', updated);
    };

    const addExampleToObjection = (objection: string, example: string) => {
        if (!example.trim()) return;

        const updated = {
            ...objections,
            [objection]: {
                ...objections[objection],
                examples: [...objections[objection].examples, example],
            },
        };

        updateField('objectionHandlingGuide', updated);
    };

    return (
        <>
            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Add New Objection</h3>
                    <div className="space-y-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Objection</span>
                            </label>
                            <input
                                type="text"
                                className="input input-bordered"
                                placeholder="e.g., 'Too expensive'"
                                value={newObjection}
                                onChange={(e) => setNewObjection(e.target.value)}
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Response Strategy</span>
                            </label>
                            <textarea
                                className="textarea textarea-bordered"
                                placeholder="How should reps handle this objection?"
                                value={newStrategy}
                                onChange={(e) => setNewStrategy(e.target.value)}
                                rows={3}
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Example Response (optional)</span>
                            </label>
                            <input
                                type="text"
                                className="input input-bordered"
                                placeholder="Example of how to respond..."
                                value={newExample}
                                onChange={(e) => setNewExample(e.target.value)}
                            />
                        </div>

                        <button className="btn btn-primary gap-2" onClick={addObjection}>
                            <Plus className="h-4 w-4" />
                            Add Objection
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {Object.entries(objections).map(([objection, data]) => (
                    <div key={objection} className="card bg-base-100 border border-base-300">
                        <div className="card-body">
                            <div className="flex items-start justify-between">
                                <h4 className="font-semibold text-lg">{objection}</h4>
                                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => deleteObjection(objection)}>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm font-medium">Response Strategy:</span>
                                    <p className="text-sm text-base-content/80">{data.response_strategy}</p>
                                </div>

                                {data.examples.length > 0 && (
                                    <div>
                                        <span className="text-sm font-medium">Examples:</span>
                                        <ul className="list-disc list-inside space-y-1">
                                            {data.examples.map((example, idx) => (
                                                <li key={idx} className="text-sm text-base-content/80">
                                                    {example}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {Object.keys(objections).length === 0 && (
                    <div className="alert">
                        <AlertCircle className="h-4 w-4" />
                        <span>No objection handling guides added yet. Add one above to get started.</span>
                    </div>
                )}
            </div>
        </>
    );
}

// Competitor Intel Section Component
function CompetitorIntelSection({
    formData,
    updateField,
}: {
    formData: Partial<CompanyTrainingData>;
    updateField: <K extends keyof CompanyTrainingData>(field: K, value: CompanyTrainingData[K]) => void;
}) {
    const [newCompetitor, setNewCompetitor] = useState('');
    const [newStrength, setNewStrength] = useState('');
    const [newWeakness, setNewWeakness] = useState('');
    const [newPositioning, setNewPositioning] = useState('');

    const competitors = formData.competitorInfo ?? {};

    const addCompetitor = () => {
        if (!newCompetitor.trim()) return;

        const updated = {
            ...competitors,
            [newCompetitor]: {
                strengths: newStrength ? [newStrength] : [],
                weaknesses: newWeakness ? [newWeakness] : [],
                positioning: newPositioning,
            },
        };

        updateField('competitorInfo', updated);
        setNewCompetitor('');
        setNewStrength('');
        setNewWeakness('');
        setNewPositioning('');
    };

    const deleteCompetitor = (competitor: string) => {
        const updated = { ...competitors };
        delete updated[competitor];
        updateField('competitorInfo', updated);
    };

    return (
        <>
            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Add New Competitor</h3>
                    <div className="space-y-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Competitor Name</span>
                            </label>
                            <input
                                type="text"
                                className="input input-bordered"
                                placeholder="e.g., 'Competitor X'"
                                value={newCompetitor}
                                onChange={(e) => setNewCompetitor(e.target.value)}
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Our Positioning vs This Competitor</span>
                            </label>
                            <textarea
                                className="textarea textarea-bordered"
                                placeholder="How should reps position us against this competitor?"
                                value={newPositioning}
                                onChange={(e) => setNewPositioning(e.target.value)}
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Their Strength</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    placeholder="Add a strength..."
                                    value={newStrength}
                                    onChange={(e) => setNewStrength(e.target.value)}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Their Weakness</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    placeholder="Add a weakness..."
                                    value={newWeakness}
                                    onChange={(e) => setNewWeakness(e.target.value)}
                                />
                            </div>
                        </div>

                        <button className="btn btn-primary gap-2" onClick={addCompetitor}>
                            <Plus className="h-4 w-4" />
                            Add Competitor
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {Object.entries(competitors).map(([competitor, data]) => (
                    <div key={competitor} className="card bg-base-100 border border-base-300">
                        <div className="card-body">
                            <div className="flex items-start justify-between">
                                <h4 className="font-semibold text-lg">{competitor}</h4>
                                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => deleteCompetitor(competitor)}>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                {data.positioning && (
                                    <div>
                                        <span className="text-sm font-medium">Our Positioning:</span>
                                        <p className="text-sm text-base-content/80">{data.positioning}</p>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-sm font-medium text-error">Their Strengths:</span>
                                        {data.strengths.length > 0 ? (
                                            <ul className="list-disc list-inside space-y-1">
                                                {data.strengths.map((strength, idx) => (
                                                    <li key={idx} className="text-sm text-base-content/80">
                                                        {strength}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-base-content/50">None listed</p>
                                        )}
                                    </div>

                                    <div>
                                        <span className="text-sm font-medium text-success">Their Weaknesses:</span>
                                        {data.weaknesses.length > 0 ? (
                                            <ul className="list-disc list-inside space-y-1">
                                                {data.weaknesses.map((weakness, idx) => (
                                                    <li key={idx} className="text-sm text-base-content/80">
                                                        {weakness}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-base-content/50">None listed</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {Object.keys(competitors).length === 0 && (
                    <div className="alert">
                        <AlertCircle className="h-4 w-4" />
                        <span>No competitor information added yet. Add one above to get started.</span>
                    </div>
                )}
            </div>
        </>
    );
}

// Ideal Responses Section Component
function IdealResponsesSection({
    formData,
    updateField,
}: {
    formData: Partial<CompanyTrainingData>;
    updateField: <K extends keyof CompanyTrainingData>(field: K, value: CompanyTrainingData[K]) => void;
}) {
    const [newScenario, setNewScenario] = useState('');
    const [newResponse, setNewResponse] = useState('');
    const [newKeyPoint, setNewKeyPoint] = useState('');

    const responses = formData.idealResponses ?? {};

    const addResponse = () => {
        if (!newScenario.trim() || !newResponse.trim()) return;

        const updated = {
            ...responses,
            [newScenario]: {
                ideal_response: newResponse,
                key_points: newKeyPoint ? [newKeyPoint] : [],
            },
        };

        updateField('idealResponses', updated);
        setNewScenario('');
        setNewResponse('');
        setNewKeyPoint('');
    };

    const deleteResponse = (scenario: string) => {
        const updated = { ...responses };
        delete updated[scenario];
        updateField('idealResponses', updated);
    };

    return (
        <>
            <div className="card bg-base-100 border border-base-300">
                <div className="card-body">
                    <h3 className="card-title">Add New Ideal Response</h3>
                    <div className="space-y-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Scenario/Question</span>
                            </label>
                            <input
                                type="text"
                                className="input input-bordered"
                                placeholder="e.g., 'Tell me about your product'"
                                value={newScenario}
                                onChange={(e) => setNewScenario(e.target.value)}
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Ideal Response</span>
                            </label>
                            <textarea
                                className="textarea textarea-bordered"
                                placeholder="The ideal way to respond to this scenario..."
                                value={newResponse}
                                onChange={(e) => setNewResponse(e.target.value)}
                                rows={4}
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Key Point (optional)</span>
                            </label>
                            <input
                                type="text"
                                className="input input-bordered"
                                placeholder="Important point to emphasize..."
                                value={newKeyPoint}
                                onChange={(e) => setNewKeyPoint(e.target.value)}
                            />
                        </div>

                        <button className="btn btn-primary gap-2" onClick={addResponse}>
                            <Plus className="h-4 w-4" />
                            Add Ideal Response
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {Object.entries(responses).map(([scenario, data]) => (
                    <div key={scenario} className="card bg-base-100 border border-base-300">
                        <div className="card-body">
                            <div className="flex items-start justify-between">
                                <h4 className="font-semibold text-lg">{scenario}</h4>
                                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => deleteResponse(scenario)}>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm font-medium">Ideal Response:</span>
                                    <p className="text-sm text-base-content/80">{data.ideal_response}</p>
                                </div>

                                {data.key_points.length > 0 && (
                                    <div>
                                        <span className="text-sm font-medium">Key Points:</span>
                                        <ul className="list-disc list-inside space-y-1">
                                            {data.key_points.map((point, idx) => (
                                                <li key={idx} className="text-sm text-base-content/80">
                                                    {point}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {Object.keys(responses).length === 0 && (
                    <div className="alert">
                        <AlertCircle className="h-4 w-4" />
                        <span>No ideal responses added yet. Add one above to get started.</span>
                    </div>
                )}
            </div>
        </>
    );
}
