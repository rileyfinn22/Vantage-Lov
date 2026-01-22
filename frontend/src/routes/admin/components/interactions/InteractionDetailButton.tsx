import { useState, type ReactNode } from 'react';
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
import type { LucideIcon } from 'lucide-react';

interface InteractionDetailButtonProps {
    /** Number to display in the indicator badge */
    count: number;
    /** Label text for the button */
    label: string;
    /** Lucide icon component to display */
    Icon: LucideIcon;
    /** Content to render in the floating UI modal */
    children: (props: { onClose: () => void }) => ReactNode;
    /** Max width class for the modal (e.g., 'max-w-3xl', 'max-w-4xl') */
    maxWidth?: string;
    /** Always show the button even when count is 0 */
    alwaysShow?: boolean;
    /** Label to use when count is 0 and alwaysShow is true */
    missingLabel?: string;
}

/**
 * Generic button component that displays a count badge and opens a floating modal.
 * Consolidates the floating UI boilerplate used across ratings, flags, and metadata buttons.
 */
export const InteractionDetailButton = ({
    count,
    label,
    Icon,
    children,
    maxWidth = 'max-w-3xl',
    alwaysShow,
    missingLabel,
}: InteractionDetailButtonProps) => {
    const [isOpen, setIsOpen] = useState(false);

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

    // Don't render if count is 0 and alwaysShow is not set
    if (count === 0 && !alwaysShow) return null;

    // Determine badge styling and content based on count
    const isMissing = count === 0;
    const badgeClass = isMissing ? 'indicator-item badge badge-error badge-sm' : 'indicator-item badge badge-secondary badge-sm';
    const badgeContent = isMissing ? '!' : count;
    const buttonLabel = isMissing && missingLabel ? missingLabel : label;

    return (
        <>
            <div className="indicator">
                <span className={badgeClass}>{badgeContent}</span>
                <button ref={refs.setReference} {...getReferenceProps()} className="btn btn-ghost btn-xs gap-1">
                    <Icon className="w-3 h-3" />
                    <span>{buttonLabel}</span>
                </button>
            </div>

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
                                    className: `relative flex h-[80vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl`,
                                    role: 'dialog',
                                    'aria-modal': true,
                                })}
                            >
                                {children({ onClose: () => setIsOpen(false) })}
                            </div>
                        </FloatingFocusManager>
                    </FloatingOverlay>
                </FloatingPortal>
            )}
        </>
    );
};
