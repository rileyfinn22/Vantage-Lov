import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { ho } from '#/data/client';

const HealthCheck = () => {
    const [showError, setShowError] = useState(true);
    const _lastErr = useRef(false);

    const { isError, refetch } = useQuery({
        queryKey: ['health'],
        queryFn: async () => {
            const response = await ho.vantage.health.$get();
            if (!response.ok) {
                throw new Error('Health check failed');
            }
            return response.json();
        },
        // refetchInterval: (query) => {
        // Refetch every 30 seconds if there's an error
        // return query.state.status === 'error' ? 3_500 : 8_000;
        // },
        retry: false,
    });

    if (!isError || !showError) {
        return null;
    }

    return (
        <div className="alert alert-error fixed top-0 left-0 right-0 z-50 rounded-none">
            <CircleAlert className="h-6 w-6 shrink-0" />
            <span>Unable to connect to backend services. Please check your connection.</span>
            <div>
                <button className="btn btn-sm btn-ghost" onClick={() => refetch()}>
                    Retry
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setShowError(false)}>
                    ✕
                </button>
            </div>
        </div>
    );
};

export default HealthCheck;
