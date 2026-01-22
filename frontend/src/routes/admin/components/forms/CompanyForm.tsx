import { useState } from 'react';
import { useForm } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';

interface Company {
    id?: number;
    name: string;
    revenueGoal?: string | null;
}

interface CompanyFormProps {
    company?: Company;
    onSuccess: () => void;
    onCancel: () => void;
}

const CompanyForm = ({ company, onSuccess, onCancel }: CompanyFormProps) => {
    const isEdit = !!company;

    const { onFinish, formLoading } = useForm({
        action: isEdit ? 'edit' : 'create',
        resource: 'company',
        id: company?.id,
        onMutationSuccess: () => {
            addNotification(isEdit ? 'Company updated successfully' : 'Company created successfully', 'success');
            onSuccess();
        },
        onMutationError: (error) => {
            addNotification(`Failed to ${isEdit ? 'update' : 'create'} company: ${error.message}`, 'error');
        },
    });

    const [formData, setFormData] = useState<Company>({
        name: company?.name ?? '',
        revenueGoal: company?.revenueGoal ?? '',
    });

    const [errors, setErrors] = useState<Partial<Record<keyof Company, string>>>({});

    const validateForm = (): boolean => {
        const newErrors: Partial<Record<keyof Company, string>> = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Company name is required';
        }

        if (formData.revenueGoal && Number.isNaN(Number(formData.revenueGoal))) {
            newErrors.revenueGoal = 'Revenue goal must be a valid number';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        const submitData = {
            name: formData.name.trim(),
            revenueGoal: formData.revenueGoal ? Number(formData.revenueGoal) : null,
        };

        await onFinish(submitData);
    };

    const handleInputChange = (field: keyof Company) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData((prev) => ({ ...prev, [field]: e.target.value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-control">
                <label htmlFor="company-name" className="label">
                    <span className="label-text font-medium">Company Name *</span>
                </label>
                <input
                    id="company-name"
                    type="text"
                    className={`input input-bordered w-full ${errors.name ? 'input-error' : ''}`}
                    placeholder="Enter company name"
                    value={formData.name}
                    onChange={handleInputChange('name')}
                    disabled={formLoading}
                />
                {errors.name && (
                    <label htmlFor="company-name" className="label">
                        <span className="label-text-alt text-error">{errors.name}</span>
                    </label>
                )}
            </div>

            <div className="form-control">
                <label htmlFor="revenue-goal" className="label">
                    <span className="label-text font-medium">Monthly Revenue Goal</span>
                </label>
                <input
                    id="revenue-goal"
                    type="number"
                    step="0.01"
                    className={`input input-bordered w-full ${errors.revenueGoal ? 'input-error' : ''}`}
                    placeholder="Enter monthly revenue goal (optional)"
                    value={formData.revenueGoal ?? ''}
                    onChange={handleInputChange('revenueGoal')}
                    disabled={formLoading}
                />
                {errors.revenueGoal && (
                    <label htmlFor="revenue-goal" className="label">
                        <span className="label-text-alt text-error">{errors.revenueGoal}</span>
                    </label>
                )}
                <label htmlFor="revenue-goal" className="label">
                    <span className="label-text-alt">Optional: Set a monthly revenue target for this company</span>
                </label>
            </div>

            <div className="flex gap-3 pt-4">
                <button type="submit" className="btn btn-primary flex-1" disabled={formLoading}>
                    {formLoading ? (
                        <>
                            <span className="loading loading-spinner loading-sm"></span>
                            {isEdit ? 'Updating...' : 'Creating...'}
                        </>
                    ) : isEdit ? (
                        'Update Company'
                    ) : (
                        'Create Company'
                    )}
                </button>
                <button type="button" onClick={onCancel} className="btn btn-ghost flex-1" disabled={formLoading}>
                    Cancel
                </button>
            </div>
        </form>
    );
};

export default CompanyForm;
