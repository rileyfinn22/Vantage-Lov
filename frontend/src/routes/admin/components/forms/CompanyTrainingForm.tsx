import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from '#data/client';
import { BookOpen, Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import { tw } from '#util/tw';

const Section = tw.div`bg-base-100 rounded-lg border border-base-300 p-6 space-y-4`;
const SectionHeader = tw.h3`text-lg font-semibold flex items-center gap-2`;
const Label = tw.label`label`;
const LabelText = tw.span`label-text font-medium`;
const TextArea = tw.textarea`textarea textarea-bordered w-full`;
const Input = tw.input`input input-bordered w-full`;
const Button = tw.button`btn`;

interface CompanyTrainingData {
    id?: number;
    companyId: number;
    onboardingDocument: string | null;
    idealResponses: Record<string, { ideal_response: string; key_points: string[] }> | null;
    objectionHandlingGuide: Record<string, { response_strategy: string; examples: string[] }> | null;
    productPositioning: string | null;
    competitorInfo: Record<string, { strengths: string[]; weaknesses: string[]; positioning: string }> | null;
    companyValues: string[] | null;
    targetCustomerProfile: string | null;
    salesMethodology: string | null;
}

interface Company {
    id: number;
    name: string;
}

export function CompanyTrainingForm() {
    const queryClient = useQueryClient();
    const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

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

    const [formData, setFormData] = useState<Partial<CompanyTrainingData>>({});

    // Update form data when training data loads
    useState(() => {
        if (trainingData) {
            setFormData(trainingData);
        } else if (selectedCompanyId) {
            setFormData({
                companyId: selectedCompanyId,
                onboardingDocument: '',
                idealResponses: {},
                objectionHandlingGuide: {},
                productPositioning: '',
                competitorInfo: {},
                companyValues: [],
                targetCustomerProfile: '',
                salesMethodology: '',
            });
        }
    });

    const handleSave = () => {
        saveMutation.mutate(formData);
    };

    if (!selectedCompanyId) {
        return (
            <div className="p-6">
                <Section>
                    <SectionHeader>
                        <BookOpen className="h-5 w-5 text-primary" />
                        Company AI Training Configuration
                    </SectionHeader>
                    <p className="text-sm text-base-content/70">
                        Select a company to configure their AI training data. This data will be used to customize prompts and improve flag
                        accuracy.
                    </p>

                    <div className="form-control">
                        <Label>
                            <LabelText>Select Company</LabelText>
                        </Label>
                        <select
                            className="select select-bordered w-full"
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
                </Section>
            </div>
        );
    }

    const selectedCompany = companies?.find((c) => c.id === selectedCompanyId);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">AI Training Configuration</h2>
                    <p className="text-sm text-base-content/70">
                        Company: <span className="font-medium">{selectedCompany?.name}</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button className="btn-ghost" onClick={() => setSelectedCompanyId(null)}>
                        Change Company
                    </Button>
                    <Button className="btn-primary gap-2" onClick={handleSave} disabled={saveMutation.isPending}>
                        <Save className="h-4 w-4" />
                        {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>

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

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            ) : (
                <>
                    {/* Onboarding Document */}
                    <Section>
                        <SectionHeader>Company Overview & Onboarding</SectionHeader>
                        <p className="text-sm text-base-content/60">
                            Provide company background, mission, values, and key information about your business
                        </p>
                        <div className="form-control">
                            <TextArea
                                rows={8}
                                placeholder="Enter company overview, mission statement, values, and onboarding information..."
                                value={formData.onboardingDocument ?? ''}
                                onChange={(e) => setFormData({ ...formData, onboardingDocument: e.target.value })}
                            />
                        </div>
                    </Section>

                    {/* Product Positioning */}
                    <Section>
                        <SectionHeader>Product Positioning & Messaging</SectionHeader>
                        <p className="text-sm text-base-content/60">
                            How should your reps position and talk about your product or service?
                        </p>
                        <div className="form-control">
                            <TextArea
                                rows={6}
                                placeholder="Enter product positioning, key messaging, unique value proposition..."
                                value={formData.productPositioning ?? ''}
                                onChange={(e) => setFormData({ ...formData, productPositioning: e.target.value })}
                            />
                        </div>
                    </Section>

                    {/* Target Customer Profile */}
                    <Section>
                        <SectionHeader>Target Customer Profile (ICP)</SectionHeader>
                        <p className="text-sm text-base-content/60">
                            Describe your ideal customer profile, including industry, company size, roles, pain points
                        </p>
                        <div className="form-control">
                            <TextArea
                                rows={6}
                                placeholder="Enter ideal customer profile details..."
                                value={formData.targetCustomerProfile ?? ''}
                                onChange={(e) => setFormData({ ...formData, targetCustomerProfile: e.target.value })}
                            />
                        </div>
                    </Section>

                    {/* Sales Methodology */}
                    <Section>
                        <SectionHeader>Sales Methodology</SectionHeader>
                        <p className="text-sm text-base-content/60">
                            What sales framework does your team follow? (e.g., MEDDIC, SPIN, Challenger, Sandler)
                        </p>
                        <div className="form-control">
                            <Input
                                type="text"
                                placeholder="e.g., MEDDIC, SPIN Selling, Challenger Sale..."
                                value={formData.salesMethodology ?? ''}
                                onChange={(e) => setFormData({ ...formData, salesMethodology: e.target.value })}
                            />
                        </div>
                    </Section>

                    {/* Company Values */}
                    <Section>
                        <SectionHeader>Company Values</SectionHeader>
                        <p className="text-sm text-base-content/60">Core values that should guide sales conversations (comma-separated)</p>
                        <div className="form-control">
                            <Input
                                type="text"
                                placeholder="e.g., Integrity, Customer First, Innovation..."
                                value={formData.companyValues?.join(', ') ?? ''}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        companyValues: e.target.value
                                            .split(',')
                                            .map((v) => v.trim())
                                            .filter(Boolean),
                                    })
                                }
                            />
                        </div>
                    </Section>

                    {/* JSON Editor Note */}
                    <div className="alert alert-info">
                        <AlertCircle className="h-4 w-4" />
                        <div>
                            <p className="font-medium">Advanced Configuration</p>
                            <p className="text-sm">
                                For now, ideal responses, objection handling, and competitor info can be edited via the CRUD tab
                                (company_training_data table). A rich UI for these will be added in the next iteration.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
