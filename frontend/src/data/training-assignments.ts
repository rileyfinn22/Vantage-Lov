import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from './client';
import type { ExtractData } from './types';

// Types
export type TrainingAssignment = ExtractData<(typeof ho.vantage.api.training.assignments)[':salespersonId']['$get']>[number];
export type CreateTrainingAssignmentInput = {
    salespersonId: number;
    skillName: string;
    dueDate?: string;
    priority?: 'low' | 'normal' | 'high';
    notes?: string;
};
export type UpdateTrainingAssignmentInput = {
    status?: 'pending' | 'in_progress' | 'completed';
    priority?: 'low' | 'normal' | 'high';
    notes?: string;
    dueDate?: string;
};

/**
 * Hook to fetch training assignments
 * If salespersonId is provided, fetch for that salesperson (requires manager access)
 * Otherwise, fetch for current user
 */
export function useTrainingAssignments(salespersonId?: string) {
    return useQuery({
        queryKey: ['training', 'assignments', salespersonId ?? 'me'],
        queryFn: async () => {
            if (!salespersonId) {
                throw new Error('Salesperson ID is required');
            }
            const response = await ho.vantage.api.training.assignments[':salespersonId'].$get({
                param: { salespersonId },
                query: {},
            });
            if (!response.ok) {
                throw new Error('Failed to fetch training assignments');
            }
            return response.json();
        },
        staleTime: 60_000, // Cache for 1 minute
    });
}

/**
 * Hook to create a new training assignment (managers only)
 */
export function useCreateTrainingAssignment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateTrainingAssignmentInput) => {
            const response = await ho.vantage.api.training.assignments.manual.$post({
                json: {
                    salespersonId: input.salespersonId,
                    trainingType: 'scenario' as const,
                    trainingId: input.skillName,
                    title: `${input.skillName} Training`,
                    description: input.notes,
                    priority: input.priority ?? 'normal',
                    dueDate: input.dueDate,
                },
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error ?? 'Failed to create training assignment');
            }
            return response.json();
        },
        onSuccess: (_, variables) => {
            // Invalidate assignments for this salesperson
            queryClient.invalidateQueries({
                queryKey: ['training', 'assignments', variables.salespersonId.toString()],
            });
            queryClient.invalidateQueries({
                queryKey: ['training', 'assignments', 'me'],
            });
        },
    });
}

/**
 * Hook to update a training assignment
 */
export function useUpdateTrainingAssignment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: number; updates: UpdateTrainingAssignmentInput }) => {
            // Only status can be updated via PATCH, other fields are ignored
            if (!updates.status) {
                throw new Error('Status is required for update');
            }
            const response = await ho.vantage.api.training.assignments[':id'].status.$patch({
                param: { id: id.toString() },
                json: { status: updates.status },
            });
            if (!response.ok) {
                const error = (await response.json()) as { error?: string };
                throw new Error(error.error ?? 'Failed to update training assignment');
            }
            return response.json();
        },
        onSuccess: () => {
            // Invalidate all assignment queries
            queryClient.invalidateQueries({
                queryKey: ['training', 'assignments'],
            });
        },
    });
}

/**
 * Hook to delete a training assignment (managers only)
 */
export function useDeleteTrainingAssignment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number) => {
            const response = await ho.vantage.api.training.assignments[':id'].$delete({
                param: { id: id.toString() },
            });
            if (!response.ok) {
                const error = (await response.json()) as { error?: string };
                throw new Error(error.error ?? 'Failed to delete training assignment');
            }
            return response.json();
        },
        onSuccess: () => {
            // Invalidate all assignment queries
            queryClient.invalidateQueries({
                queryKey: ['training', 'assignments'],
            });
        },
    });
}

/**
 * Input type for battle card assignment
 */
export type CreateBattleCardAssignmentInput = {
    salespersonId: number;
    battleCardId: string;
    title: string;
    description?: string;
    dueDate?: string;
};

/**
 * Hook to assign a battle card to a salesperson (managers only)
 */
export function useAssignBattleCard() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateBattleCardAssignmentInput) => {
            const response = await ho.vantage.api.training.assignments['battle-card'].$post({
                json: {
                    salespersonId: input.salespersonId,
                    battleCardId: input.battleCardId,
                    title: input.title,
                    description: input.description,
                    dueDate: input.dueDate,
                },
            });
            if (!response.ok) {
                const error = (await response.json()) as { error?: string };
                throw new Error(error.error ?? 'Failed to assign battle card');
            }
            return response.json();
        },
        onSuccess: (_, variables) => {
            // Invalidate assignments for this salesperson
            queryClient.invalidateQueries({
                queryKey: ['training', 'assignments', variables.salespersonId.toString()],
            });
        },
    });
}
