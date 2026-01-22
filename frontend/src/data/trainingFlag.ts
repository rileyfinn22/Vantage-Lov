import { atom } from 'nanostores';
import { useFlagData, type FlagDetail } from './fetchers';

// CURRENT FLAG stuff
export const $currentFlagId = atom('');

// Store flag details for computed values
const $flagDetailsData = atom<FlagDetail | null>(null);

export function useTrainingFlag(flagId: string) {
    // Update the store with the current flag ID
    if ($currentFlagId.get() !== flagId) {
        $currentFlagId.set(flagId);
    }

    const { data, isPending: loading, error } = useFlagData(flagId);

    // Update the atom for computed values
    if (data) {
        $flagDetailsData.set(data);
    }

    // Extract data from the response structure
    const flagData = data?.flag;
    const relatedInteraction = data?.interaction;
    const salespersonData = data?.salesperson;
    const audioFile = data?.audioFile;
    const transcriptData = relatedInteraction?.v1_raw_google_diarized ?? null;
    const interactionFlags = data?.interactionFlags ?? [];

    return {
        loading,
        error,
        flagData,
        relatedInteraction,
        salespersonData,
        audioFile,
        transcriptData,
        interactionFlags,
    };
}
