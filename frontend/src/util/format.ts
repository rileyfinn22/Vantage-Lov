/**
 * Formatting utilities for dates, times, currency, and numbers
 * Pure functions with no side effects
 */

/**
 * Format a timestamp as relative time (e.g., "2 hours ago", "3 days ago")
 * Handles null/undefined gracefully
 */
export function formatTimeAgo(timestamp: string | null | undefined): string {
    if (!timestamp) return 'Unknown';

    const now = new Date();
    const flagTime = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - flagTime.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
}

/**
 * Format a date to locale string with time
 * Returns empty string for null/undefined
 */
export function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '';

    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Format a date to short locale string (no time)
 * Returns empty string for null/undefined
 */
export function formatDateShort(dateString: string | null | undefined): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
}

/**
 * Format a date to full locale string with time
 * Returns empty string for null/undefined
 */
export function formatDateTime(dateString: string | null | undefined): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
}

/**
 * Format a number as USD currency
 * No decimal places for whole numbers
 */
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Format a number with locale-aware thousands separators
 */
export function formatNumber(num: number): string {
    return num.toLocaleString();
}

/**
 * Format seconds as MM:SS or HH:MM:SS for audio timestamps
 * @param seconds - total seconds to format
 * @returns formatted time string (e.g., "3:42" or "1:23:45")
 */
export function formatAudioTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse audio timestamp to total seconds
 * Accepts formats: "HH:MM:SS", "MM:SS", or raw seconds (number or string)
 * @param timestamp - timestamp to parse
 * @returns total seconds, or 0 if invalid
 */
export function parseAudioTimestamp(timestamp: string | number | null | undefined): number {
    if (timestamp == null) return 0;

    // If it's already a number, return it
    if (typeof timestamp === 'number') {
        return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
    }

    // Check for time string format first (contains colons)
    if (timestamp.includes(':')) {
        const parts = timestamp.split(':').map((part) => parseInt(part, 10));

        if (parts.length === 2) {
            // MM:SS format
            const [minutes, seconds] = parts;
            if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
                return minutes * 60 + seconds;
            }
        } else if (parts.length === 3) {
            // HH:MM:SS format
            const [hours, minutes, seconds] = parts;
            if (!Number.isNaN(hours) && !Number.isNaN(minutes) && !Number.isNaN(seconds)) {
                return hours * 3600 + minutes * 60 + seconds;
            }
        }
    }

    // Try parsing as a raw number (seconds)
    const asNumber = parseFloat(timestamp);
    if (!Number.isNaN(asNumber) && Number.isFinite(asNumber) && asNumber >= 0) {
        return asNumber;
    }

    return 0;
}
