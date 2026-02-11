import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCreateMeetingPrep, type CreateMeetingPrepInput } from '#data/meetingPrep';

const callTypeOptions = [
    { value: 'discovery', label: 'Discovery Call' },
    { value: 'demo', label: 'Demo / Presentation' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'closing', label: 'Closing Call' },
    { value: 'follow_up', label: 'Follow-up' },
] as const;

const companySizeOptions = [
    { value: 'startup', label: 'Startup (1-50)' },
    { value: 'smb', label: 'SMB (50-200)' },
    { value: 'mid-market', label: 'Mid-Market (200-1000)' },
    { value: 'enterprise', label: 'Enterprise (1000+)' },
];

export function NewPrepPage() {
    const [, navigate] = useLocation();
    const createMutation = useCreateMeetingPrep();

    const [formData, setFormData] = useState<CreateMeetingPrepInput>({
        prospectCompany: '',
        prospectContactName: '',
        prospectContactRole: '',
        prospectIndustry: '',
        prospectCompanySize: '',
        prospectWebsite: '',
        callType: 'discovery',
        meetingGoal: '',
        knownPainPoints: [],
        previousInteractions: '',
        notes: '',
    });

    const [painPointsText, setPainPointsText] = useState('');
    const [errors, setErrors] = useState<Partial<Record<keyof CreateMeetingPrepInput, string>>>({});

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        // Clear error when field is edited
        if (errors[name as keyof CreateMeetingPrepInput]) {
            setErrors((prev) => ({ ...prev, [name]: undefined }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        const newErrors: typeof errors = {};
        if (!formData.prospectCompany.trim()) {
            newErrors.prospectCompany = 'Company name is required';
        }
        if (!formData.meetingGoal.trim()) {
            newErrors.meetingGoal = 'Meeting goal is required';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // Parse pain points from comma-separated text
        const painPoints = painPointsText
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

        try {
            const result = await createMutation.mutateAsync({
                ...formData,
                knownPainPoints: painPoints.length > 0 ? painPoints : undefined,
            });

            // Navigate to the prep view
            if (result.prep?.id) {
                navigate(`/prep/${result.prep.id}`);
            }
        } catch {
            // Error handled by mutation
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/prep')}>
                <ArrowLeft className="w-4 h-4" />
                Back to Preps
            </button>

            <div className="mb-6">
                <h1 className="text-2xl font-bold">New Meeting Prep</h1>
                <p className="text-base-content/70">Enter details about your upcoming meeting</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column - Prospect Info */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold border-b border-base-300 pb-2">Prospect Information</h2>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Company Name *</span>
                            </label>
                            <input
                                type="text"
                                name="prospectCompany"
                                value={formData.prospectCompany}
                                onChange={handleChange}
                                className={`input input-bordered w-full ${errors.prospectCompany ? 'input-error' : ''}`}
                                placeholder="Acme Corp"
                            />
                            {errors.prospectCompany && <span className="text-error text-sm mt-1">{errors.prospectCompany}</span>}
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Contact Name</span>
                            </label>
                            <input
                                type="text"
                                name="prospectContactName"
                                value={formData.prospectContactName}
                                onChange={handleChange}
                                className="input input-bordered w-full"
                                placeholder="John Smith"
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Contact Role / Title</span>
                            </label>
                            <input
                                type="text"
                                name="prospectContactRole"
                                value={formData.prospectContactRole}
                                onChange={handleChange}
                                className="input input-bordered w-full"
                                placeholder="VP of Sales"
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Industry</span>
                            </label>
                            <input
                                type="text"
                                name="prospectIndustry"
                                value={formData.prospectIndustry}
                                onChange={handleChange}
                                className="input input-bordered w-full"
                                placeholder="Technology, Healthcare, etc."
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Company Size</span>
                            </label>
                            <select
                                name="prospectCompanySize"
                                value={formData.prospectCompanySize}
                                onChange={handleChange}
                                className="select select-bordered w-full"
                            >
                                <option value="">Select size...</option>
                                {companySizeOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Website</span>
                            </label>
                            <input
                                type="text"
                                name="prospectWebsite"
                                value={formData.prospectWebsite}
                                onChange={handleChange}
                                className="input input-bordered w-full"
                                placeholder="https://example.com"
                            />
                        </div>
                    </div>

                    {/* Right Column - Meeting Context */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold border-b border-base-300 pb-2">Meeting Context</h2>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Call Type *</span>
                            </label>
                            <select
                                name="callType"
                                value={formData.callType}
                                onChange={handleChange}
                                className="select select-bordered w-full"
                            >
                                {callTypeOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Your Goal for This Meeting *</span>
                            </label>
                            <textarea
                                name="meetingGoal"
                                value={formData.meetingGoal}
                                onChange={handleChange}
                                className={`textarea textarea-bordered w-full h-24 ${errors.meetingGoal ? 'textarea-error' : ''}`}
                                placeholder="What do you want to achieve in this meeting?"
                            />
                            {errors.meetingGoal && <span className="text-error text-sm mt-1">{errors.meetingGoal}</span>}
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Known Pain Points</span>
                                <span className="label-text-alt">Comma separated</span>
                            </label>
                            <textarea
                                value={painPointsText}
                                onChange={(e) => setPainPointsText(e.target.value)}
                                className="textarea textarea-bordered w-full h-20"
                                placeholder="Budget constraints, Integration issues, etc."
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Previous Interactions</span>
                            </label>
                            <textarea
                                name="previousInteractions"
                                value={formData.previousInteractions}
                                onChange={handleChange}
                                className="textarea textarea-bordered w-full h-20"
                                placeholder="Any prior calls, emails, or context..."
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Additional Notes</span>
                            </label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                className="textarea textarea-bordered w-full h-20"
                                placeholder="Any other context that might be helpful..."
                            />
                        </div>
                    </div>
                </div>

                {createMutation.isError && (
                    <div className="alert alert-error">
                        <span>Failed to create meeting prep. Please try again.</span>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-base-300">
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/prep')}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                        {createMutation.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Prep'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
