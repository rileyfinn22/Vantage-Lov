import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './index.css';
import SlopApp from './routes';
import { VantageDevErrorBoundary } from './error';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 8_500,
            refetchOnWindowFocus: false,
        },
    },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <VantageDevErrorBoundary>
                <SlopApp />
            </VantageDevErrorBoundary>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </QueryClientProvider>
    </StrictMode>,
);
