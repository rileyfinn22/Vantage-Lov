import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from './client';
import type { ExtractData } from './types';

// Types
export type SkillsSummary = ExtractData<(typeof ho.vantage.api.salespeople)[':id']['skills']['summary']['$get']>;
export type SkillsTrends = ExtractData<(typeof ho.vantage.api.salespeople)[':id']['skills']['trends']['$get']>;
export type SkillDistribution = ExtractData<(typeof ho.vantage.api.salespeople)[':id']['skills']['distribution']['$get']>;
export type SkillCallDetails = ExtractData<(typeof ho.vantage.api.salespeople)[':id']['skills']['details']['$get']>;

/**
 * Hook to fetch skills summary for a salesperson
 * Returns current week and month averages for all skills
 */
export function useSkillsSummary(salespersonId: string) {
    return useQuery({
        queryKey: ['salespeople', salespersonId, 'skills', 'summary'],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople[':id']['skills']['summary'].$get({
                param: { id: salespersonId },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch skills summary');
            }
            return response.json();
        },
        enabled: !!salespersonId,
        staleTime: 60_000, // Cache for 1 minute
    });
}

/**
 * Hook to fetch skills trends for a salesperson over time
 * Returns time series data for all skills
 */
export function useSkillsTrends(salespersonId: string, period: 'week' | 'month' | 'quarter' | 'all' = 'month', limit: number = 12) {
    return useQuery({
        queryKey: ['salespeople', salespersonId, 'skills', 'trends', period, limit],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople[':id']['skills']['trends'].$get({
                param: { id: salespersonId },
                query: { period, limit: limit.toString() },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch skills trends');
            }
            return response.json();
        },
        enabled: !!salespersonId,
        staleTime: 5 * 60_000, // Cache for 5 minutes
    });
}

/**
 * Hook to fetch skill distribution (score histogram) for a specific skill
 * Returns how many calls at each score level
 */
export function useSkillDistribution(salespersonId: string, skill: 'objection_handling' | 'pricing_discussions' | 'discovery' | 'closing') {
    return useQuery({
        queryKey: ['salespeople', salespersonId, 'skills', 'distribution', skill],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople[':id']['skills']['distribution'].$get({
                param: { id: salespersonId },
                query: { skill },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch skill distribution');
            }
            return response.json();
        },
        enabled: !!salespersonId && !!skill,
        staleTime: 5 * 60_000, // Cache for 5 minutes
    });
}

/**
 * Hook to fetch detailed call-by-call data for a specific skill
 * Returns all calls with scores, evidence, and missed opportunities
 */
export function useSkillCallDetails(salespersonId: string, skill: 'objection_handling' | 'pricing_discussions' | 'discovery' | 'closing') {
    return useQuery({
        queryKey: ['salespeople', salespersonId, 'skills', 'details', skill],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople[':id']['skills']['details'].$get({
                param: { id: salespersonId },
                query: { skill },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch skill call details');
            }
            return response.json();
        },
        enabled: !!salespersonId && !!skill,
        staleTime: 5 * 60_000, // Cache for 5 minutes
    });
}
