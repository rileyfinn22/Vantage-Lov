import { useMe } from '#util/useMe.ts';
import { ho } from '#data/client';
import { useLocation } from 'wouter';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import { useSalesPersonData } from './fetchers';
import { useQuery } from '@tanstack/react-query';

export type Rating = {
    score: number;
};

export type Revenue = {
    amount: number;
};

export type Insights = {
    flags: string[];
    kudos: string[];
};

export const $hoveringSales = atom('');

export type RepInfo = { id: number; firstName: string; lastName: string; avatar?: string | null };

export function useDashboardData() {
    return useQuery({
        queryKey: ['dashboard'],
        queryFn: async () => {
            const response = await ho.vantage.api.page.dashboard.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch dashboard');
            }
            return response.json();
        },
        retry: false,
    });
}

export function useDashboard() {
    const [_] = useLocation();
    const me = useMe();
    const hoveringSales = useStore($hoveringSales);
    const { data: dashboardData, isPending: loading, error } = useDashboardData();

    // Check if user is an admin
    const isAdmin = me.userData?.roles?.siteRoles?.includes('admin') || me.userData?.roles?.companyRoles?.some((r) => r.role === 'admin');

    // Get the first salesperson ID from leaderboard for fallback
    const firstSalespersonId = dashboardData?.leaderboard?.[0]?.id;

    // Determine which salesperson data to fetch:
    // 1. If hovering, fetch that salesperson
    // 2. If user has their own salesData, use that
    // 3. If admin without salesData, fetch first salesperson from leaderboard
    const shouldFetchOtherSales = hoveringSales && hoveringSales !== String(me.salesData?.salesperson?.id);
    const shouldFetchFallback = !me.salesData && isAdmin && firstSalespersonId && !hoveringSales;

    const otherSalesDetails = useSalesPersonData(
        shouldFetchOtherSales ? hoveringSales : shouldFetchFallback ? String(firstSalespersonId) : '',
    );

    const focusSales = (salesPersonId: string) => {
        $hoveringSales.set(salesPersonId);
    };

    const required = {
        me,
        leaderboard: dashboardData?.leaderboard ?? [],
        star: dashboardData?.star,
    };

    // Determine which salesDetails to use
    const salesDetails = shouldFetchOtherSales || shouldFetchFallback ? otherSalesDetails.data : me.salesData;

    return {
        loading,
        error,
        ...required,
        salesDetails,
        hoveringSales,
        focusSales,
        salesError: me.error,
    };
}
