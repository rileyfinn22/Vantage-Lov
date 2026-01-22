import { useQuery } from '@tanstack/react-query';
import { ho } from './client';
import type { ExtractData } from './types';

// Types
export type SalesDetail = ExtractData<(typeof ho.vantage.api.salespeople)[':id']['$get']>;
export type FlagDetail = ExtractData<(typeof ho.vantage.api.salespeople.flag)[':flagId']['$get']>;

// Hooks
export function useSalesPersonData(id: string) {
    return useQuery({
        queryKey: ['salesperson', id],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople[':id'].$get({ param: { id } });
            if (!response.ok) {
                throw new Error('Failed to fetch sales person');
            }
            return response.json();
        },
        enabled: !!id,
    });
}

export function queryFlagData(flagId: string) {
    return {
        queryKey: ['flag', flagId],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople.flag[':flagId'].$get({ param: { flagId } });
            if (!response.ok) {
                throw new Error('Failed to fetch flag');
            }
            return response.json();
        },
        staleTime: 10_000,
        enabled: !!flagId,
        retry: false,
    };
}

export function useFlagData(flagId: string) {
    return useQuery(queryFlagData(flagId));
}

export function useAudioDownloadUrl(fileId: number | null | undefined, enabled = true) {
    return useQuery({
        queryKey: ['audio-download', fileId],
        queryFn: async () => {
            if (!fileId) return null;

            console.log('[Audio] Fetching download URL for file:', fileId);

            // First, get the download URL from the API
            const response = await ho.vantage.api.upload.download[':id'].$get({ param: { id: String(fileId) } });
            console.log('[Audio] Download URL response status:', response.status);
            if (!response.ok) {
                const text = await response.text();
                console.error('[Audio] Failed to get download URL:', text);
                throw new Error('Failed to fetch audio URL');
            }
            const data = await response.json();
            const downloadUrl = data.downloadUrl;
            console.log('[Audio] Got download URL:', downloadUrl);

            // For local files, fetch with credentials and create blob URL
            // This ensures cookies are sent for authentication
            if (downloadUrl.startsWith('/')) {
                console.log('[Audio] Fetching local file with credentials');
                const mediaResponse = await fetch(downloadUrl, {
                    credentials: 'include',
                });
                console.log('[Audio] Media fetch response status:', mediaResponse.status);
                if (!mediaResponse.ok) {
                    const text = await mediaResponse.text();
                    console.error('[Audio] Failed to fetch media:', text);
                    throw new Error('Failed to fetch media file');
                }
                const blob = await mediaResponse.blob();
                const blobUrl = URL.createObjectURL(blob);
                console.log('[Audio] Created blob URL:', blobUrl);
                return blobUrl;
            }

            // For external URLs (GCS presigned), return directly
            return downloadUrl;
        },
        enabled: enabled && !!fileId,
        retry: false,
    });
}
