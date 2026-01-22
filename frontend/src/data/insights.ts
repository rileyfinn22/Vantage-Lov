import { useQuery } from '@tanstack/react-query';
import { ho } from '#data/client';

export type TimePeriod = 'week' | 'month' | 'quarter';
export type SalesPhase = 'outreach' | 'discovery' | 'demo' | 'close';

export interface Objection {
    id: string;
    title: string;
    frequency: number;
    trend: 'up' | 'down' | 'stable';
    phase: SalesPhase;
    impact: 'high' | 'medium' | 'low';
    description: string;
    totalCallsMentioned?: number;
    overcomePercentage?: number;
}

export interface ProspectPainpoint {
    id: string;
    title: string;
    frequency: number;
    phase: SalesPhase;
    severity: 'critical' | 'major' | 'minor';
    description: string;
    totalCallsMentioned?: number;
    resolutionPercentage?: number;
}

export interface RepPainpoint {
    id: string;
    title: string;
    frequency: number;
    phase: SalesPhase;
    severity: 'critical' | 'major' | 'minor';
    description: string;
    totalCallsMentioned?: number;
    resolutionPercentage?: number;
}

export interface CallStats {
    total_org_calls: number;
    times_mentioned: number;
    overcome_percentage: number;
}

export interface Notification {
    id: number;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    status: 'unread' | 'read' | 'dismissed';
    priority: number | null;
    createdAt: string | null;
    readAt: string | null;
    dismissedAt: string | null;
    userId: string | null;
    salespersonId: number | null;
    interactionId: number | null;
    flagId: number | null;
}

// Backend response types (from our schema)
interface BackendObjection {
    id: number;
    title: string;
    description: string;
    frequency: number;
    trend: 'up' | 'down' | 'stable';
    phase: SalesPhase;
    impact: 'high' | 'medium' | 'low';
    totalCallsMentioned: number | null;
    overcomePercentage: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    companyId: number;
}

interface BackendPainPoint {
    id: number;
    title: string;
    description: string;
    frequency: number;
    phase: SalesPhase;
    severity: 'critical' | 'major' | 'minor';
    isProspectPain: boolean;
    totalCallsMentioned: number | null;
    resolutionPercentage: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    companyId: number;
}

interface BackendInsightsResponse {
    notifications: Notification[];
    objections: BackendObjection[];
    prospectPainPoints: BackendPainPoint[];
    repPainPoints: BackendPainPoint[];
    totalOrgCalls: number;
}

// Data transformation functions
function transformObjection(backendObj: BackendObjection): Objection {
    return {
        id: backendObj.id.toString(),
        title: backendObj.title,
        frequency: backendObj.frequency,
        trend: backendObj.trend,
        phase: backendObj.phase,
        impact: backendObj.impact,
        description: backendObj.description,
        totalCallsMentioned: backendObj.totalCallsMentioned ?? 0,
        overcomePercentage: backendObj.overcomePercentage ? parseFloat(backendObj.overcomePercentage) : 0,
    };
}

function transformPainPoint(backendPain: BackendPainPoint): ProspectPainpoint | RepPainpoint {
    const base = {
        id: backendPain.id.toString(),
        title: backendPain.title,
        frequency: backendPain.frequency,
        phase: backendPain.phase,
        severity: backendPain.severity,
        description: backendPain.description,
        totalCallsMentioned: backendPain.totalCallsMentioned ?? 0,
        resolutionPercentage: backendPain.resolutionPercentage ? parseFloat(backendPain.resolutionPercentage) : 0,
    };

    return base as ProspectPainpoint | RepPainpoint;
}

function generateCallStats(
    data: {
        objections: Objection[];
        prospectPainpoints: ProspectPainpoint[];
        repPainpoints: RepPainpoint[];
    },
    totalOrgCalls: number,
): Record<string, CallStats> {
    const stats: Record<string, CallStats> = {};

    // Generate call stats from objections
    data.objections.forEach((obj) => {
        stats[obj.id] = {
            total_org_calls: totalOrgCalls,
            times_mentioned: obj.totalCallsMentioned ?? 0,
            overcome_percentage: obj.overcomePercentage ?? 0,
        };
    });

    // Generate call stats from pain points
    [...data.prospectPainpoints, ...data.repPainpoints].forEach((pain) => {
        stats[pain.id] = {
            total_org_calls: totalOrgCalls,
            times_mentioned: pain.totalCallsMentioned ?? 0,
            overcome_percentage: pain.resolutionPercentage ?? 0,
        };
    });

    return stats;
}

export interface InsightsData {
    objections: Objection[];
    prospectPainpoints: ProspectPainpoint[];
    repPainpoints: RepPainpoint[];
    callStats: Record<string, CallStats>;
    notifications: Notification[];
    totalOrgCalls: number;
}

// Insights fetcher function
const insightsFetch = async () => {
    const response = await ho.vantage.api.insights.$get();
    if (!response.ok) {
        throw new Error('Failed to fetch insights data');
    }

    const backendData: BackendInsightsResponse = await response.json();

    // Transform backend data to frontend format
    const objections = backendData.objections.map(transformObjection);
    const prospectPainpoints = backendData.prospectPainPoints.map(transformPainPoint) as ProspectPainpoint[];
    const repPainpoints = backendData.repPainPoints.map(transformPainPoint) as RepPainpoint[];

    // Generate call stats
    const transformedData = {
        objections,
        prospectPainpoints,
        repPainpoints,
    };
    const callStats = generateCallStats(transformedData, backendData.totalOrgCalls ?? 0);

    const result = {
        objections,
        prospectPainpoints,
        repPainpoints,
        callStats,
        notifications: backendData.notifications,
        totalOrgCalls: backendData.totalOrgCalls ?? 0,
    };

    return result;
};

// Hook
export function useInsightsData() {
    return useQuery({
        queryKey: ['insights'],
        queryFn: insightsFetch,
    });
}

// Hook to get a specific item from insights data
export function useInsightItem(itemType: 'objection' | 'prospect-pain' | 'rep-pain', itemId: string) {
    const { data, isPending, error } = useInsightsData();

    const item = data
        ? (() => {
              switch (itemType) {
                  case 'objection':
                      return data.objections.find((obj) => obj.id === itemId);
                  case 'prospect-pain':
                      return data.prospectPainpoints.find((pain) => pain.id === itemId);
                  case 'rep-pain':
                      return data.repPainpoints.find((pain) => pain.id === itemId);
                  default:
                      return undefined;
              }
          })()
        : undefined;

    const callStats = data?.callStats[itemId];

    return {
        data: item,
        callStats,
        isPending,
        error,
    };
}

// Helper functions for notification management
export async function markNotificationRead(notificationId: number) {
    try {
        const response = await ho.vantage.api.insights.notifications[':id'].read.$patch({
            param: { id: notificationId.toString() },
        });

        if (!response.ok) {
            throw new Error('Failed to mark notification as read');
        }

        return await response.json();
    } catch (error) {
        console.error('Error marking notification as read:', error);
        throw error;
    }
}

export async function dismissNotification(notificationId: number) {
    try {
        const response = await ho.vantage.api.insights.notifications[':id'].dismiss.$patch({
            param: { id: notificationId.toString() },
        });

        if (!response.ok) {
            throw new Error('Failed to dismiss notification');
        }

        return await response.json();
    } catch (error) {
        console.error('Error dismissing notification:', error);
        throw error;
    }
}
