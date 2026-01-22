import { useSelect } from '@refinedev/core';
import { useSearchParams } from 'wouter';

const CompanySelector = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedCompany = searchParams.get('company') ? Number(searchParams.get('company')) : null;
    const { query, options } = useSelect({
        resource: 'company',
        optionLabel: 'name',
        optionValue: 'id',
    });

    const handleCompanyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set('company', value);
        } else {
            newParams.delete('company');
        }
        setSearchParams(Object.fromEntries(newParams));
    };

    if (query.isLoading)
        return (
            <div className="p-4 border-b border-base-300">
                <div className="skeleton h-12 w-64"></div>
            </div>
        );
    if (query.error) return <div className="p-4 text-error">Error loading companies: {query.error.message}</div>;

    return (
        <div className="p-4 border-b border-base-300">
            <div className="flex items-center gap-4">
                <label htmlFor="company-selector" className="label">
                    <span className="label-text font-semibold">Select Company:</span>
                </label>
                <select
                    id="company-selector"
                    className="select select-bordered w-full max-w-xs"
                    value={selectedCompany ?? ''}
                    onChange={handleCompanyChange}
                >
                    <option value="">All Companies</option>
                    {options?.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="text-sm text-base-content/70">{options?.length ?? 0} companies available</div>
            </div>
        </div>
    );
};

export default CompanySelector;
