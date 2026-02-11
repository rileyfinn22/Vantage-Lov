import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from './client';

// Types
export interface MeetingPrep {
    id: number;
    salespersonId: number;
    companyId: number;
    prospectCompany: string;
    prospectContactName: string | null;
    prospectContactRole: string | null;
    prospectIndustry: string | null;
    prospectCompanySize: string | null;
    prospectWebsite: string | null;
    callType: 'discovery' | 'demo' | 'negotiation' | 'closing' | 'follow_up';
    meetingGoal: string;
    knownPainPoints: string[] | null;
    previousInteractions: string | null;
    notes: string | null;
    prepGuide: string | null;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }> | null;
    agentId: string | null;
    agentPrompt: { systemPrompt: string; firstMessage: string; voiceId?: string } | null;
    status: 'setup' | 'ready' | 'practiced';
    createdAt: string;
    updatedAt: string;
}

export interface CreateMeetingPrepInput {
    prospectCompany: string;
    prospectContactName?: string;
    prospectContactRole?: string;
    prospectIndustry?: string;
    prospectCompanySize?: string;
    prospectWebsite?: string;
    callType: 'discovery' | 'demo' | 'negotiation' | 'closing' | 'follow_up';
    meetingGoal: string;
    knownPainPoints?: string[];
    previousInteractions?: string;
    notes?: string;
}

// Hooks
export function useMeetingPreps() {
    return useQuery({
        queryKey: ['meetingPreps'],
        queryFn: async () => {
            const response = await ho.vantage.api['meeting-prep'].$get();
            if (!response.ok) throw new Error('Failed to fetch meeting preps');
            return response.json();
        },
    });
}

export function useMeetingPrep(id: string | number) {
    return useQuery({
        queryKey: ['meetingPrep', id],
        queryFn: async () => {
            const response = await ho.vantage.api['meeting-prep'][':id'].$get({
                param: { id: String(id) },
            });
            if (!response.ok) throw new Error('Failed to fetch meeting prep');
            return response.json();
        },
        enabled: !!id,
    });
}

export function useCreateMeetingPrep() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateMeetingPrepInput) => {
            const response = await ho.vantage.api['meeting-prep'].$post({
                json: data,
            });
            if (!response.ok) throw new Error('Failed to create meeting prep');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['meetingPreps'] });
        },
    });
}

export function useUpdateMeetingPrep() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: Partial<CreateMeetingPrepInput> }) => {
            const response = await ho.vantage.api['meeting-prep'][':id'].$patch({
                param: { id: String(id) },
                json: data,
            });
            if (!response.ok) throw new Error('Failed to update meeting prep');
            return response.json();
        },
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['meetingPreps'] });
            queryClient.invalidateQueries({ queryKey: ['meetingPrep', id] });
        },
    });
}

export function useDeleteMeetingPrep() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number) => {
            const response = await ho.vantage.api['meeting-prep'][':id'].$delete({
                param: { id: String(id) },
            });
            if (!response.ok) throw new Error('Failed to delete meeting prep');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['meetingPreps'] });
        },
    });
}

export function useGeneratePrepGuide() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number) => {
            const response = await ho.vantage.api['meeting-prep'][':id'].generate.$post({
                param: { id: String(id) },
            });
            if (!response.ok) throw new Error('Failed to generate prep guide');
            return response.json();
        },
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: ['meetingPrep', id] });
            queryClient.invalidateQueries({ queryKey: ['meetingPreps'] });
        },
    });
}

export function useStartPrepRoleplay() {
    return useMutation({
        mutationFn: async (id: number) => {
            const response = await ho.vantage.api['meeting-prep'][':id']['start-roleplay'].$post({
                param: { id: String(id) },
            });
            if (!response.ok) throw new Error('Failed to start roleplay');
            return response.json();
        },
    });
}

export function useCompletePrepRoleplay() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            sessionData,
        }: {
            id: number;
            sessionData?: { conversationId?: string; score?: number; duration?: number };
        }) => {
            const response = await ho.vantage.api['meeting-prep'][':id'].complete.$post({
                param: { id: String(id) },
                json: sessionData,
            });
            if (!response.ok) throw new Error('Failed to complete roleplay');
            return response.json();
        },
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['meetingPrep', id] });
            queryClient.invalidateQueries({ queryKey: ['meetingPreps'] });
        },
    });
}
