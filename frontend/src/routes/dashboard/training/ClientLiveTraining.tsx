import { Suspense, lazy } from 'react';

const AudioTraining = lazy(() => import('./AudioTraining'));

export default function ClientLiveTraining({ flagId }: { flagId: string }) {
    return (
        <Suspense
            fallback={
                <div className="flex justify-center items-center p-8">
                    <span className="loading loading-spinner loading-md mr-2"></span>
                    <span>Loading voice training...</span>
                </div>
            }
        >
            <AudioTraining flagId={flagId} />
        </Suspense>
    );
}
