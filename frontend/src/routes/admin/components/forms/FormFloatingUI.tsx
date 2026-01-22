import type { ReactNode } from 'react';

interface FormFloatingUIProps {
    title: string;
    children: ReactNode;
    onClose: () => void;
}

const FormFloatingUI = ({ title, children, onClose }: FormFloatingUIProps) => {
    return (
        <div className="flex h-full flex-col gap-4 p-6">
            <div className="flex items-start justify-between gap-4 border-b border-base-300 pb-4">
                <div>
                    <h3 className="text-2xl font-semibold">{title}</h3>
                </div>
                <button onClick={onClose} className="btn btn-sm btn-ghost" aria-label="Close dialog">
                    ✕
                </button>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

export default FormFloatingUI;
