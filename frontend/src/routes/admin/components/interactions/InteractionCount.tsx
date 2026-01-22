import { useState } from 'react';
import {
    useFloating,
    autoUpdate,
    useClick,
    useDismiss,
    useInteractions,
    FloatingPortal,
    FloatingFocusManager,
    FloatingOverlay,
} from '@floating-ui/react';
import InteractionsFloatingUI from './InteractionsFloatingUI';
import { useInteractionsWithRelations } from './useInteractionsWithRelations';

interface InteractionCountProps {
    salespersonId: number;
}

const InteractionCount = ({ salespersonId }: InteractionCountProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const { refs, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        whileElementsMounted: autoUpdate,
    });

    const click = useClick(context);
    const dismiss = useDismiss(context, {
        outsidePress: false,
    });

    const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

    // Get interactions with all related data (ratings, flags, bigfiles) in a single API call
    const { data, isLoading, error, refetch } = useInteractionsWithRelations({
        salespersonId,
        page: currentPage,
        pageSize,
        sortBy: 'createdAt',
        sortOrder: 'desc',
    });

    const interactionCount = data?.total ?? 0;

    if (isLoading && !data) return <span className="loading loading-spinner loading-xs"></span>;
    if (!isOpen) {
        if (error) return <span className="text-error">Error</span>;
    }

    return (
        <>
            <button ref={refs.setReference} {...getReferenceProps()} className="btn btn-ghost btn-sm underline">
                {interactionCount} interaction{interactionCount !== 1 ? 's' : ''}
            </button>

            {isOpen && (
                <FloatingPortal>
                    <FloatingOverlay
                        lockScroll
                        className="z-50 flex items-center justify-center bg-base-content/50 backdrop-blur-sm p-4"
                        onClick={(event) => {
                            if (event.target === event.currentTarget) {
                                setIsOpen(false);
                            }
                        }}
                    >
                        <FloatingFocusManager context={context} modal>
                            <div
                                ref={refs.setFloating}
                                {...getFloatingProps({
                                    className:
                                        'relative flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl',
                                    role: 'dialog',
                                    'aria-modal': true,
                                })}
                            >
                                <InteractionsFloatingUI
                                    salespersonId={salespersonId}
                                    interactions={data?.data || []}
                                    currentPage={currentPage}
                                    pageSize={pageSize}
                                    totalCount={interactionCount}
                                    onPageChange={setCurrentPage}
                                    onClose={() => setIsOpen(false)}
                                    onInteractionAdded={() => refetch()}
                                    onInteractionDeleted={() => refetch()}
                                />
                            </div>
                        </FloatingFocusManager>
                    </FloatingOverlay>
                </FloatingPortal>
            )}
        </>
    );
};

export default InteractionCount;
