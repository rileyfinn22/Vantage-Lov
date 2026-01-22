import { useOne } from '@refinedev/core';
import DetailsDropdown from './DetailsDropdown';

interface CompanyNameProps {
    companyId: number | null;
}

const CompanyName = ({ companyId }: CompanyNameProps) => {
    const { query } = useOne({
        resource: 'company',
        id: companyId ?? 0,
    });

    if (!companyId) return <span>-</span>;
    if (query.isLoading) return <div className="skeleton h-4 w-20"></div>;
    if (query.error) return <span>Error</span>;

    const companyName = query.data?.data?.name ?? 'Unknown';

    return <DetailsDropdown trigger={<span>{companyName}</span>} data={query.data?.data ?? null} title="Company Details" />;
};

export default CompanyName;
