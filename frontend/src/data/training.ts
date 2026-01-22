import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ho } from './client';
import type { ExtractData } from './types';

// Type for the training session response
export type TrainingSessionData = ExtractData<(typeof ho.vantage.api.training.flag)[':flagId']['start-session']['$post']>;

// Type for training scenarios response
export type TrainingScenarios = ExtractData<(typeof ho.vantage.api.training.scenarios)[':skillKey']['$get']>;

// Type for scenario session response
export type ScenarioSessionData = ExtractData<(typeof ho.vantage.api.training.scenario)[':scenarioId']['start-session']['$post']>;

// Type for single scenario response
export type ScenarioData = ExtractData<(typeof ho.vantage.api.training.scenario)[':scenarioId']['$get']>;

/**
 * Hook to fetch a single training scenario by ID
 * @param scenarioId - The scenario ID (e.g., 'pricing_objection_1')
 * @returns Query object with scenario data and React Query helpers
 */
export function useTrainingScenario(scenarioId: string) {
    return useQuery({
        queryKey: ['training-scenario', scenarioId],
        queryFn: async () => {
            const res = await ho.vantage.api.training.scenario[':scenarioId'].$get({
                param: { scenarioId },
            });
            if (!res.ok) {
                throw new Error('Failed to fetch training scenario');
            }
            return await res.json();
        },
        enabled: !!scenarioId,
    });
}

/**
 * Hook to fetch training scenarios for a specific skill
 * @param skillKey - The skill key to fetch scenarios for (e.g., 'objection_handling', 'pricing_discussions')
 * @returns Query object with scenarios array and React Query helpers
 */
export function useTrainingScenarios(skillKey: string) {
    return useQuery({
        queryKey: ['training-scenarios', skillKey],
        queryFn: async () => {
            const res = await ho.vantage.api.training.scenarios[':skillKey'].$get({
                param: { skillKey },
            });
            if (!res.ok) {
                throw new Error('Failed to fetch training scenarios');
            }
            return await res.json();
        },
    });
}

/**
 * Hook to start a training session for a specific scenario
 * @param scenarioId - The ID of the scenario to train on
 * @returns Mutation object with signedUrl, agentId, sessionId, scenario data, and mutation helpers
 */
export function useStartScenarioSession(scenarioId: string) {
    return useMutation({
        mutationKey: ['startScenarioSession', scenarioId],
        mutationFn: async (): Promise<ScenarioSessionData> => {
            console.log('useStartScenarioSession - Starting mutation for scenarioId:', scenarioId);

            const response = await ho.vantage.api.training.scenario[':scenarioId']['start-session'].$post({
                param: { scenarioId },
            });

            console.log('useStartScenarioSession - Response received:', {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('useStartScenarioSession - Error response:', errorText);
                const status = response.status;
                if (status === 401) {
                    throw new Error('Unauthorized - please log in and try again');
                }
                if (status === 404) {
                    // Check if the error is about salesperson not found
                    try {
                        const errorJson = JSON.parse(errorText);
                        if (errorJson.error?.includes('Salesperson not found')) {
                            throw new Error('Your account is not set up as a salesperson. Please contact an administrator.');
                        }
                    } catch {
                        // Ignore parse errors
                    }
                    throw new Error('Training scenario not found');
                }
                throw new Error(`Failed to start scenario training session (${status})`);
            }

            const data = await response.json();
            console.log('useStartScenarioSession - Response data:', data);
            return data;
        },
    });
}

/**
 * Hook to start a training session for a specific flag
 * @param flagId - The ID of the flag to train on
 * @returns Mutation object with signedUrl, agentId, flag, interaction, salesperson, and mutation helpers
 */
export function useStartTrainingSession(flagId: string) {
    return useMutation({
        mutationKey: ['startTrainingSession', flagId],
        mutationFn: async (): Promise<TrainingSessionData> => {
            console.log('useStartTrainingSession - Starting mutation for flagId:', flagId);

            const response = await ho.vantage.api.training.flag[':flagId']['start-session'].$post({
                param: { flagId },
            });

            console.log('useStartTrainingSession - Response received:', {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('useStartTrainingSession - Error response:', errorText);
                throw new Error('Failed to start training session');
            }

            const data = await response.json();
            console.log('useStartTrainingSession - Response data:', data);
            return data;
        },
    });
}

/**
 * Parameters for completing a flag training
 */
export interface CompleteFlagTrainingParams {
    flagId: string;
    conversationId?: string;
    score?: number;
    duration?: number;
}

/**
 * Hook to mark a flag training as complete
 * @returns Mutation object with success status and mutation helpers
 */
export function useCompleteFlagTraining() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ flagId, conversationId, score, duration }: CompleteFlagTrainingParams) => {
            const response = await ho.vantage.api.training.flag[':flagId'].complete.$post({
                param: { flagId },
                json: { conversationId, score, duration },
            });

            if (!response.ok) {
                throw new Error('Failed to complete flag training');
            }

            return await response.json();
        },
        onSuccess: () => {
            // Invalidate queries that depend on flags/completed training
            queryClient.invalidateQueries({ queryKey: ['flags'] });
            queryClient.invalidateQueries({ queryKey: ['paginated-flags'] });
            queryClient.invalidateQueries({ queryKey: ['completed-training'] });
            queryClient.invalidateQueries({ queryKey: ['training', 'assignments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });
}

interface CompleteScenarioTrainingParams {
    scenarioId: string;
    conversationId?: string;
    score?: number;
    duration?: number;
}

/**
 * Hook to mark a scenario training as complete
 * @returns Mutation object with success status and mutation helpers
 */
export function useCompleteScenarioTraining() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ scenarioId, conversationId, score, duration }: CompleteScenarioTrainingParams) => {
            const response = await ho.vantage.api.training.scenario[':scenarioId'].complete.$post({
                param: { scenarioId },
                json: { conversationId, score, duration },
            });

            if (!response.ok) {
                throw new Error('Failed to complete scenario training');
            }

            return await response.json();
        },
        onSuccess: () => {
            // Invalidate queries that depend on training sessions/assignments
            queryClient.invalidateQueries({ queryKey: ['completed-training'] });
            queryClient.invalidateQueries({ queryKey: ['training', 'assignments'] });
            queryClient.invalidateQueries({ queryKey: ['training-scenarios'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });
}

// Type for completed training item
export interface CompletedTrainingItem {
    id: string;
    type: 'scenario' | 'battle_card' | 'flag_review';
    title: string;
    description: string | null;
    repName: string;
    salespersonId: number;
    completedAt: string | null;
    source: string;
    score?: number | null;
    duration?: number | null;
    scenarioId?: string | null; // For scenario/battle_card types - used for navigation
    conversationId?: string | null; // ElevenLabs conversation ID for audio playback
}

// Type for completed training response
export type CompletedTrainingResponse = ExtractData<typeof ho.vantage.api.training.completed.$get>;

/**
 * Hook to fetch completed training sessions
 * @param salespersonId - Optional salesperson ID to filter by
 * @returns Query object with completed training data
 */
export function useCompletedTraining(salespersonId?: number) {
    return useQuery({
        queryKey: ['completed-training', salespersonId ?? 'all'],
        queryFn: async () => {
            const res = await ho.vantage.api.training.completed.$get();
            if (!res.ok) {
                throw new Error('Failed to fetch completed training');
            }
            const data = await res.json();
            // Filter by salesperson if provided
            if (salespersonId) {
                return {
                    completedTraining: data.completedTraining.filter((item: CompletedTrainingItem) => item.salespersonId === salespersonId),
                };
            }
            return data;
        },
    });
}
