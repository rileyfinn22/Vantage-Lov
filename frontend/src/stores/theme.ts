import { atom } from 'nanostores';

export type ThemeMode = 'light' | 'dark';

// Initialize from localStorage if available, default to light
const savedTheme = typeof window !== 'undefined' ? (localStorage.getItem('theme') as ThemeMode) || 'light' : 'light';

export const $themeMode = atom<ThemeMode>(savedTheme);

// Subscribe to changes and save to localStorage
$themeMode.subscribe((theme) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('theme', theme);
    }
});

// Toggle function for convenience
export function toggleTheme() {
    $themeMode.set($themeMode.get() === 'light' ? 'dark' : 'light');
}
