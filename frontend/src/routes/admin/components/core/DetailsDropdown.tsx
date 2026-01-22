import { useState } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, useClick, useDismiss, useInteractions, FloatingPortal } from '@floating-ui/react';
import type { DetailsDropdownProps } from '../types';

const DetailsDropdown = ({ trigger, data, title }: DetailsDropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        middleware: [offset(4), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
    });

    const click = useClick(context);
    const dismiss = useDismiss(context);

    const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

    if (!data) return <>{trigger}</>;

    return (
        <>
            <button
                ref={refs.setReference}
                {...getReferenceProps()}
                className="btn btn-ghost btn-sm p-1 h-auto min-h-0 cursor-pointer text-left link link-primary"
            >
                {trigger}
            </button>

            {isOpen && (
                <FloatingPortal>
                    <div
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="z-50 bg-base-100 rounded-box w-64 border border-base-300 shadow-lg p-4"
                    >
                        <h3 className="font-semibold text-sm mb-2">{title}</h3>
                        <div className="space-y-1">
                            {Object.entries(data).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                    <span className="font-medium text-base-content/70">{key}:</span>{' '}
                                    <span className="text-base-content">{String(value ?? '-')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </FloatingPortal>
            )}
        </>
    );
};

export default DetailsDropdown;
