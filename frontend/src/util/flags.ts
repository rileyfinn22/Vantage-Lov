/**
 * Flag-specific utility functions
 */

/**
 * Type representing a training flag with optional flagData
 */
type TrainingFlag = {
    flagData?: {
        flag_title?: string;
    } | null;
    reason?: string | null;
};

/**
 * Get the display title for a training flag
 * New flags use flagData.flag_title, old flags use reason field
 * Falls back to 'Untitled Flag' if neither exists
 */
export function getFlagTitle(flag: TrainingFlag): string {
    // New flags use flagData.flag_title, old flags use reason field
    return flag.flagData?.flag_title ?? flag.reason ?? 'Untitled Flag';
}

/**
 * Get the full flag title - no longer truncates
 * Kept for backwards compatibility with components using this function
 */
export function getBriefFlagTitle(flag: TrainingFlag): string {
    return getFlagTitle(flag);
}
