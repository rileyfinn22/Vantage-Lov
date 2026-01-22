import { createContext, use } from 'react';

export type Variant = 'light' | 'dark';
export type SelectableVariant = 'system' | Variant;
export const ThemeCtx = createContext<{
    selected: SelectableVariant;
    setSelected: (variant: SelectableVariant) => void;
}>({ selected: 'system', setSelected: () => {} });

export const useTheming = () => {
    const { selected: theme, setSelected } = use(ThemeCtx);
    const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)');

    return {
        theme,
        setTheme: setSelected,
        computedTheme: theme === 'system' ? (systemIsDark.matches ? 'dark' : 'light') : theme,
    };
};
