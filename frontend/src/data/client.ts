import { hc } from 'hono/client';
import type AppType from '#backendclient';

export const ho = hc<typeof AppType>('/', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
            ...init,
            credentials: 'include',
        });
    },
});
