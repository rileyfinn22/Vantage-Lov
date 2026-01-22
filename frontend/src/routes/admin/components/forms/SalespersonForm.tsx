import { useState } from 'react';
import { useForm, useSelect } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import { ho } from '#/data/client';

interface SalespersonFormData {
    id?: number;
    firstName: string;
    lastName: string;
    email?: string;
    password?: string;
    avatar?: string | null;
    companyId: number;
    associatedUserId?: string | null;
}

interface SalespersonFormProps {
    salesperson?: SalespersonFormData;
    onSuccess: () => void;
    onCancel: () => void;
}

const SalespersonForm = ({ salesperson, onSuccess, onCancel }: SalespersonFormProps) => {
    const isEdit = !!salesperson;
    const [isLoading, setIsLoading] = useState(false);

    const { onFinish, formLoading } = useForm({
        action: 'edit',
        resource: 'salespeople',
        id: salesperson?.id,
        onMutationSuccess: () => {
            addNotification('Salesperson updated successfully', 'success');
            onSuccess();
        },
        onMutationError: (error) => {
            addNotification(`Failed to update salesperson: ${error.message}`, 'error');
        },
    });

    // Get companies for dropdown
    const { query: companyQuery, options: companyOptions } = useSelect({
        resource: 'company',
        optionLabel: 'name',
        optionValue: 'id',
    });

    const [formData, setFormData] = useState<SalespersonFormData>({
        firstName: salesperson?.firstName ?? '',
        lastName: salesperson?.lastName ?? '',
        email: '',
        password: '',
        avatar: salesperson?.avatar ?? '',
        companyId: salesperson?.companyId ?? 0,
        associatedUserId: salesperson?.associatedUserId ?? '',
    });

    const [errors, setErrors] = useState<Partial<Record<keyof SalespersonFormData, string>>>({});

    const validateForm = (): boolean => {
        const newErrors: Partial<Record<keyof SalespersonFormData, string>> = {};

        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }

        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }

        if (!isEdit) {
            // Email and password are optional, but if one is provided, both must be provided
            const hasEmail = formData.email?.trim();
            const hasPassword = formData.password?.trim();

            if (hasEmail && !hasPassword) {
                newErrors.password = 'Password is required when email is provided';
            }

            if (hasPassword && !hasEmail) {
                newErrors.email = 'Email is required when password is provided';
            }

            if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email!)) {
                newErrors.email = 'Invalid email format';
            }

            if (hasPassword && formData.password!.length < 8) {
                newErrors.password = 'Password must be at least 8 characters';
            }
        }

        if (!formData.companyId || formData.companyId === 0) {
            newErrors.companyId = 'Company is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        try {
            if (isEdit) {
                // Edit mode: just update salesperson
                const submitData = {
                    firstName: formData.firstName.trim(),
                    lastName: formData.lastName.trim(),
                    avatar: formData.avatar?.trim() || null,
                    companyId: formData.companyId,
                };
                await onFinish(submitData);
            } else {
                // Create mode: single API call to create both user and salesperson
                setIsLoading(true);

                const payload: any = {
                    firstName: formData.firstName.trim(),
                    lastName: formData.lastName.trim(),
                    companyId: formData.companyId,
                    avatar: formData.avatar?.trim() || null,
                };

                // Only include email/password if both are provided
                if (formData.email?.trim() && formData.password?.trim()) {
                    payload.email = formData.email.trim();
                    payload.password = formData.password;
                }

                const response = await ho.vantage.api.admin.users.$post({
                    json: payload,
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to create salesperson');
                }

                addNotification('Salesperson created successfully', 'success');
                onSuccess();
            }
        } catch (error: any) {
            addNotification(`Error: ${error.message}`, 'error');
        } finally {
            if (!isEdit) {
                setIsLoading(false);
            }
        }
    };

    const handleInputChange = (field: keyof SalespersonFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = field === 'companyId' ? Number(e.target.value) : e.target.value;
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                    <label htmlFor="salesperson-first-name" className="label">
                        <span className="label-text font-medium">First Name *</span>
                    </label>
                    <input
                        id="salesperson-first-name"
                        type="text"
                        className={`input input-bordered w-full ${errors.firstName ? 'input-error' : ''}`}
                        placeholder="Enter first name"
                        value={formData.firstName}
                        onChange={handleInputChange('firstName')}
                        disabled={formLoading || isLoading}
                    />
                    {errors.firstName && (
                        <label htmlFor="salesperson-first-name" className="label">
                            <span className="label-text-alt text-error">{errors.firstName}</span>
                        </label>
                    )}
                </div>

                <div className="form-control">
                    <label htmlFor="salesperson-last-name" className="label">
                        <span className="label-text font-medium">Last Name *</span>
                    </label>
                    <input
                        id="salesperson-last-name"
                        type="text"
                        className={`input input-bordered w-full ${errors.lastName ? 'input-error' : ''}`}
                        placeholder="Enter last name"
                        value={formData.lastName}
                        onChange={handleInputChange('lastName')}
                        disabled={formLoading || isLoading}
                    />
                    {errors.lastName && (
                        <label htmlFor="salesperson-last-name" className="label">
                            <span className="label-text-alt text-error">{errors.lastName}</span>
                        </label>
                    )}
                </div>
            </div>

            {!isEdit && (
                <>
                    <div className="alert alert-info mb-4">
                        <span className="text-sm">
                            Email and password are optional. Provide them only if the salesperson needs login access to the platform.
                        </span>
                    </div>

                    <div className="form-control">
                        <label htmlFor="salesperson-email" className="label">
                            <span className="label-text font-medium">Email (Optional)</span>
                        </label>
                        <input
                            id="salesperson-email"
                            type="email"
                            className={`input input-bordered w-full ${errors.email ? 'input-error' : ''}`}
                            placeholder="Enter email address"
                            value={formData.email ?? ''}
                            onChange={handleInputChange('email')}
                            disabled={formLoading || isLoading}
                        />
                        {errors.email && (
                            <label htmlFor="salesperson-email" className="label">
                                <span className="label-text-alt text-error">{errors.email}</span>
                            </label>
                        )}
                    </div>

                    <div className="form-control">
                        <label htmlFor="salesperson-password" className="label">
                            <span className="label-text font-medium">Password (Optional)</span>
                        </label>
                        <input
                            id="salesperson-password"
                            type="password"
                            className={`input input-bordered w-full ${errors.password ? 'input-error' : ''}`}
                            placeholder="Enter password (min 8 characters)"
                            value={formData.password ?? ''}
                            onChange={handleInputChange('password')}
                            disabled={formLoading || isLoading}
                        />
                        {errors.password && (
                            <label htmlFor="salesperson-password" className="label">
                                <span className="label-text-alt text-error">{errors.password}</span>
                            </label>
                        )}
                    </div>
                </>
            )}

            <div className="form-control">
                <label htmlFor="salesperson-avatar" className="label">
                    <span className="label-text font-medium">Avatar</span>
                </label>
                <input
                    id="salesperson-avatar"
                    type="text"
                    className="input input-bordered w-full"
                    placeholder="Enter avatar URL (optional)"
                    value={formData.avatar ?? ''}
                    onChange={handleInputChange('avatar')}
                    disabled={formLoading || isLoading}
                />
                <label htmlFor="salesperson-avatar" className="label">
                    <span className="label-text-alt">Optional: Avatar URL for profile picture. If empty, a placeholder will be used.</span>
                </label>
            </div>

            <div className="form-control">
                <label htmlFor="salesperson-company" className="label">
                    <span className="label-text font-medium">Company *</span>
                </label>
                <select
                    id="salesperson-company"
                    className={`select select-bordered w-full ${errors.companyId ? 'select-error' : ''}`}
                    value={formData.companyId}
                    onChange={handleInputChange('companyId')}
                    disabled={formLoading || isLoading || companyQuery.isLoading}
                >
                    <option value={0}>Select a company</option>
                    {companyOptions?.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {errors.companyId && (
                    <label htmlFor="salesperson-company" className="label">
                        <span className="label-text-alt text-error">{errors.companyId}</span>
                    </label>
                )}
                {companyQuery.error && (
                    <label htmlFor="salesperson-company" className="label">
                        <span className="label-text-alt text-error">Error loading companies</span>
                    </label>
                )}
            </div>

            <div className="flex gap-3 pt-4">
                <button type="submit" className="btn btn-primary flex-1" disabled={formLoading || isLoading}>
                    {formLoading || isLoading ? (
                        <>
                            <span className="loading loading-spinner loading-sm"></span>
                            {isEdit ? 'Updating...' : 'Creating...'}
                        </>
                    ) : isEdit ? (
                        'Update Salesperson'
                    ) : (
                        'Create Salesperson'
                    )}
                </button>
                <button type="button" onClick={onCancel} className="btn btn-ghost flex-1" disabled={formLoading || isLoading}>
                    Cancel
                </button>
            </div>
        </form>
    );
};

export default SalespersonForm;
