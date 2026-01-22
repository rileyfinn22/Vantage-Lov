/**
 * Shared portrait utilities for training components
 * Consolidates duplicate portrait logic from AudioTraining.tsx and SkillTraining.tsx
 */

// Import portrait images (mostly male)
import mikeRodriguezPortrait from '#/assets/portraits/mike-rodriguez.jpg';
import davidKimPortrait from '#/assets/portraits/david-kim.jpg';
import alexThompsonPortrait from '#/assets/portraits/alex-thompson.jpg';
import jamesWilsonPortrait from '#/assets/portraits/james-wilson.jpg';

// Default portrait for pre-session display
export const DEFAULT_PORTRAIT = mikeRodriguezPortrait;

// All available portraits for fallback selection
const ALL_PORTRAITS = [mikeRodriguezPortrait, davidKimPortrait, alexThompsonPortrait, jamesWilsonPortrait];

// Map prospect names to their portrait images
const PROSPECT_PORTRAITS: Record<string, string> = {
    'Mike Chen': mikeRodriguezPortrait,
    'David Park': davidKimPortrait,
    'Mike Johnson': mikeRodriguezPortrait,
    'Alex Thompson': alexThompsonPortrait,
    'James Wilson': jamesWilsonPortrait,
};

/**
 * Get a deterministic portrait based on name
 * If name exists in PROSPECT_PORTRAITS, return that portrait
 * Otherwise, use a hash of the name to pick a consistent portrait
 */
export function getPortraitForName(name: string): string {
    // Check if we have a specific portrait for this name
    if (PROSPECT_PORTRAITS[name]) {
        return PROSPECT_PORTRAITS[name];
    }

    // Use name hash to pick a consistent portrait
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return ALL_PORTRAITS[Math.abs(hash) % ALL_PORTRAITS.length];
}
