import { useOne } from '@refinedev/core';
import DetailsDropdown from './DetailsDropdown';

interface UserNameProps {
    userId: string | null;
}

const UserName = ({ userId }: UserNameProps) => {
    const { query } = useOne({
        resource: 'user',
        id: userId ?? '',
        queryOptions: {
            enabled: !!userId,
        },
    });

    if (!userId) return <span>-</span>;
    if (query.isLoading) return <div className="skeleton h-4 w-20"></div>;
    if (query.error) return <span>Error</span>;

    const userName = query.data?.data?.name ?? 'Unknown';

    return <DetailsDropdown trigger={<span>{userName}</span>} data={query.data?.data ?? null} title="User Details" />;
};

export default UserName;
