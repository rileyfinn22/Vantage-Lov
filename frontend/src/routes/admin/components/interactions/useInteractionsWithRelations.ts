import { useQuery } from '@tanstack/react-query';
import { ho } from '#/data/client';
import type { ExtractData } from '#/data/types';

type InteractionsResponse = ExtractData<(typeof ho.vantage.api.admin.interactions)['with-relations']['$get']>;
export type InteractionWithRelationsAPI = InteractionsResponse['data'][number];

interface UseInteractionsWithRelationsParams {
    salespersonId: number;
    page?: number;
    pageSize?: number;
    sortBy?: 'createdAt' | 'id' | 'processedAt' | 'blurb';
    sortOrder?: 'asc' | 'desc';
}

/**
 * Custom hook to fetch interactions with all related data (ratings, flags, bigfiles) in a single API call.
 * This replaces the pattern of fetching interactions and then making separate calls for each relation.
 */
export function useInteractionsWithRelations({
    salespersonId,
    page = 1,
    pageSize = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
}: UseInteractionsWithRelationsParams) {
    return useQuery({
        queryKey: ['admin', 'interactions-with-relations', salespersonId, page, pageSize, sortBy, sortOrder],
        queryFn: async () => {
            const response = await ho.vantage.api.admin.interactions['with-relations'].$get({
                query: {
                    salespersonId: String(salespersonId),
                    page: String(page),
                    pageSize: String(pageSize),
                    sortBy,
                    sortOrder,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch interactions');
            }

            return response.json();
        },
        // Keep previous data while fetching new page
        placeholderData: (previousData) => previousData,
        refetchInterval: ({ state: { data } }) => data?.data.some((d) => d.processedStatus === 'processing') && 2_000,
    });
}
