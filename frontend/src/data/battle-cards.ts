import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from '#data/client';

export type SalesPhase = 'outreach' | 'discovery' | 'demo' | 'close';

export interface BattleCard {
    id: number;
    companyId: number;
    title: string;
    challenge: string;
    phase: SalesPhase;
    strategy: string;
    approach: string[];
    script: string;
    nextStep: string;
    sourceType: string;
    sourceId: number | null;
    frequency: number;
    successRate: string | null;
    impactScore: string | null;
    status: string;
    difficultyLevel: number;
    isActive: boolean;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface TrainingScenario {
    id: number;
    skillKey: string;
    scenarioId: string;
    title: string;
    difficulty: string;
    duration: string;
    participants: number;
    context: string;
    scenario: string;
    objectives: string[];
    commonObjections: string[];
    idealOutcome: string;
    aiPrompt: string;
    firstMessage: string | null;
    prospectData: {
        name: string;
        company: string;
        role: string;
        personality: string;
        avatarUrl?: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface BattleCardWithScenario {
    battleCard: BattleCard;
    scenario: TrainingScenario | null;
}

// Fetch all active battle cards for the user's company
const fetchBattleCards = async (): Promise<BattleCard[]> => {
    const response = await ho.vantage.api['battle-cards'].$get();
    if (!response.ok) {
        throw new Error('Failed to fetch battle cards');
    }
    return await response.json();
};

// Fetch a single battle card with its linked training scenario
const fetchBattleCardWithScenario = async (id: number): Promise<BattleCardWithScenario> => {
    const response = await ho.vantage.api['battle-cards'][':id'].$get({
        param: { id: id.toString() },
    });
    if (!response.ok) {
        throw new Error('Failed to fetch battle card');
    }
    return await response.json();
};

// Start training for a battle card (creates/returns the linked scenario)
const startBattleCardTraining = async (id: number): Promise<BattleCardWithScenario> => {
    const response = await ho.vantage.api['battle-cards'][':id'].train.$post({
        param: { id: id.toString() },
    });
    if (!response.ok) {
        throw new Error('Failed to start battle card training');
    }
    return await response.json();
};

// Hook to fetch all battle cards
export function useBattleCards() {
    return useQuery({
        queryKey: ['battle-cards'],
        queryFn: fetchBattleCards,
    });
}

// Hook to fetch a single battle card with scenario
export function useBattleCard(id: number) {
    return useQuery({
        queryKey: ['battle-cards', id],
        queryFn: () => fetchBattleCardWithScenario(id),
        enabled: !!id,
    });
}

// Hook to start training for a battle card
export function useStartBattleCardTraining() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: startBattleCardTraining,
        onSuccess: (data) => {
            // Invalidate and refetch battle card queries
            queryClient.invalidateQueries({ queryKey: ['battle-cards', data.battleCard.id] });
            queryClient.invalidateQueries({ queryKey: ['battle-cards'] });
        },
    });
}

// Hook to find a battle card for a specific source (objection or pain point)
export function useBattleCardForSource(sourceType: 'objection' | 'pain_point', sourceId: number) {
    const { data: battleCards, isPending, error } = useBattleCards();

    const battleCard = battleCards?.find((card) => card.sourceType === sourceType && card.sourceId === sourceId);

    return {
        data: battleCard,
        isPending,
        error,
    };
}

// Update battle card mutation
export interface UpdateBattleCardInput {
    strategy?: string;
    approach?: string[];
    script?: string;
    nextStep?: string;
    isActive?: boolean;
    status?: 'draft' | 'active' | 'archived';
}

const updateBattleCard = async (id: number, data: UpdateBattleCardInput): Promise<BattleCard> => {
    const response = await ho.vantage.api['battle-cards'][':id'].$patch({
        param: { id: id.toString() },
        json: data,
    });
    if (!response.ok) {
        throw new Error('Failed to update battle card');
    }
    return await response.json();
};

// Hook to update a battle card
export function useUpdateBattleCard() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateBattleCardInput }) => updateBattleCard(id, data),
        onSuccess: (updatedCard) => {
            // Invalidate and refetch battle card queries
            queryClient.invalidateQueries({ queryKey: ['battle-cards', updatedCard.id] });
            queryClient.invalidateQueries({ queryKey: ['battle-cards'] });
        },
    });
}
