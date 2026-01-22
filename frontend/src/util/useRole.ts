import { useMyUserData } from './useMe';

/**
 * Hook to check if current user is a manager/admin in any company
 */
export function useIsManager(): boolean {
    const { data: userData } = useMyUserData();

    // Check if user has admin or manager role in any company
    const hasCompanyAdminOrManagerRole =
        userData?.roles?.companyRoles?.some((role) => role.role === 'admin' || role.role === 'manager') ?? false;

    // Check if user has site admin role
    const hasSiteAdminRole = userData?.roles?.siteRoles?.includes('admin') ?? false;

    return hasCompanyAdminOrManagerRole || hasSiteAdminRole;
}
