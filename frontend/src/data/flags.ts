import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ho } from './client';
import type { ExtractData } from './types';

// Type for the paginated flags response
export type PaginatedFlagsResponse = ExtractData<(typeof ho.vantage.api.flags)['$get']>;

/**
 * Hook to fetch paginated training flags for a salesperson
 * @param salespersonId - The ID of the salesperson to fetch flags for
 * @param pageSize - Number of flags per page (default: 5)
 */
export function usePaginatedFlags(salespersonId: string, pageSize = 5) {
    const [page, setPage] = useState(1);

    const query = useQuery({
        queryKey: ['flags', salespersonId, page, pageSize],
        queryFn: async () => {
            const response = await ho.vantage.api.flags.$get({
                query: {
                    salespersonId,
                    page: String(page),
                    pageSize: String(pageSize),
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch flags');
            }

            return response.json();
        },
        enabled: !!salespersonId,
        placeholderData: (previousData) => previousData,
    });

    return {
        ...query,
        page,
        goToNextPage: () => {
            if (query.data && query.data.pagination.page < query.data.pagination.totalPages) {
                setPage((p) => p + 1);
            }
        },
        goToPreviousPage: () => {
            if (page > 1) {
                setPage((p) => p - 1);
            }
        },
        hasNextPage: query.data ? query.data.pagination.page < query.data.pagination.totalPages : false,
        hasPreviousPage: page > 1,
    };
}
