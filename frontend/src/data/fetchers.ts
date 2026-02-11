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

export function useAudioDownloadUrl(fileId: number | null | undefined, enabled = true, mimeType?: string | null) {
    const isVideo = mimeType?.startsWith('video/') ?? false;
    return useQuery({
        queryKey: ['audio-download', fileId, isVideo],
        queryFn: async () => {
            if (!fileId) return null;

            const response = await ho.vantage.api.upload.download[':id'].$get({ param: { id: String(fileId) } });
            if (!response.ok) {
                throw new Error('Failed to fetch audio URL');
            }
            const data = await response.json();
            const downloadUrl = data.downloadUrl;

            // Video: return URL directly so <video> can stream with range requests
            // Audio: fetch as blob to ensure auth cookies are sent for local files
            if (isVideo) {
                return downloadUrl;
            }

            if (downloadUrl.startsWith('/')) {
                const mediaResponse = await fetch(downloadUrl, {
                    credentials: 'include',
                });
                if (!mediaResponse.ok) {
                    throw new Error('Failed to fetch media file');
                }
                const blob = await mediaResponse.blob();
                return URL.createObjectURL(blob);
            }

            return downloadUrl;
        },
        enabled: enabled && !!fileId,
        retry: false,
    });
}
