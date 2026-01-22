import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from '#data/client';

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

interface NotificationsResponse {
    notifications: Notification[];
}

// Query hook
export function useNotificationsData() {
    return useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const response = await ho.vantage.api.notifications.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch notifications data');
            }
            const data: NotificationsResponse = await response.json();
            return data.notifications;
        },
    });
}

// Mutation hooks
export function useMarkNotificationRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notificationId: number) => {
            const response = await ho.vantage.api.notifications[':id'].read.$patch({
                param: { id: notificationId.toString() },
            });
            if (!response.ok) {
                throw new Error('Failed to mark notification as read');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

export function useDismissNotification() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notificationId: number) => {
            const response = await ho.vantage.api.notifications[':id'].dismiss.$patch({
                param: { id: notificationId.toString() },
            });
            if (!response.ok) {
                throw new Error('Failed to dismiss notification');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

export function useDeleteNotification() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notificationId: number) => {
            const response = await ho.vantage.api.notifications[':id'].$delete({
                param: { id: notificationId.toString() },
            });
            if (!response.ok) {
                throw new Error('Failed to delete notification');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const response = await ho.vantage.api.notifications['mark-all-read'].$patch();
            if (!response.ok) {
                throw new Error('Failed to mark all notifications as read');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
