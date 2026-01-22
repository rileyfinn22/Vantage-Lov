/**
 * Badge and status color utilities
 * Returns DaisyUI class names for consistent styling
 */

/**
 * Get DaisyUI text color class based on performance score (0-100)
 * Uses semantic color classes from DaisyUI
 */
export function getPerformanceColor(score: number): string {
    if (score >= 86) return 'text-success';
    if (score >= 76) return 'text-warning';
    return 'text-error';
}

/**
 * Get progress bar color based on progress percentage (0-100)
 * Uses semantic color classes from DaisyUI
 */
export function getProgressColor(progress: number): string {
    if (progress >= 100) return 'bg-success';
    if (progress >= 80) return 'bg-success';
    if (progress >= 60) return 'bg-warning';
    return 'bg-error';
}

/**
 * Get badge class for rating values (1-10 scale)
 * Uses DaisyUI badge modifier classes
 */
export function getRatingBadgeClass(value: number): string {
    if (value >= 8) return 'badge-success';
    if (value >= 6) return 'badge-warning';
    return 'badge-error';
}

/**
 * Get DaisyUI badge class for difficulty levels
 */
export function getDifficultyBadgeClass(difficulty: string): string {
    switch (difficulty.toLowerCase()) {
        case 'beginner':
            return 'badge-success';
        case 'intermediate':
            return 'badge-warning';
        case 'advanced':
            return 'badge-error';
        default:
            return 'badge-ghost';
    }
}
