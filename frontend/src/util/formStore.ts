import { useStore } from '@nanostores/react';
import { map, type PreinitializedMapStore } from 'nanostores';
import type { AllKeys } from 'node_modules/nanostores/atom';

/**
 * Create a form store with update and reset functionality.
 * @param initialState - The initial state of the form.
 */
export function formStore<T extends Record<string, any>>(initialState: T) {
    const store = map(initialState);
    return {
        store,
    };
}

export function useFormStore<T extends Record<string, any>>(initialState: PreinitializedMapStore<T>) {
    // Subscribe to the store
    const state = useStore(initialState);

    return {
        props(key: AllKeys<T>) {
            return {
                value: state[key] as string,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    initialState.setKey(key, e.target.value as T[typeof key]);
                },
            };
        },
        state,
    };
}
