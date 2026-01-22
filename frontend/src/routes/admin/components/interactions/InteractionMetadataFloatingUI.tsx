import type { InteractionWithRelationsAPI } from './useInteractionsWithRelations';

interface InteractionMetadataFloatingUIProps {
    interactionId: number;
    metadata: InteractionWithRelationsAPI['metadata'];
    onClose: () => void;
}

const InteractionMetadataFloatingUI = ({ interactionId, metadata, onClose }: InteractionMetadataFloatingUIProps) => {
    // Helper to render a value (handles arrays and simple values)
    const renderValue = (value: any) => {
        if (value === null || value === undefined) {
            return <span className="text-base-content/40 italic">Not provided</span>;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return <span className="text-base-content/40 italic">None</span>;
            }
            return (
                <ul className="list-disc list-inside space-y-1">
                    {value.map((item) => (
                        <li key={item} className="text-sm text-base-content/90">
                            {item}
                        </li>
                    ))}
                </ul>
            );
        }
        return <span className="text-sm text-base-content/90">{value}</span>;
    };

    // Helper to render a metadata section
    const renderSection = (title: string, data: Record<string, any> | undefined) => {
        if (!data || Object.keys(data).length === 0) return null;

        return (
            <div className="space-y-2">
                <h4 className="text-sm font-semibold text-base-content/80">{title}</h4>
                <div className="rounded-lg border border-base-300 bg-base-100 p-3">
                    <dl className="space-y-2">
                        {Object.entries(data).map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-1">
                                <dt className="text-xs font-medium text-base-content/60 capitalize">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                </dt>
                                <dd>{renderValue(value)}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-full flex-col gap-2 p-4 relative">
            <div className="flex items-center justify-between gap-2 border-b border-base-300 pb-2">
                <div>
                    <h3 className="text-lg font-semibold">Metadata</h3>
                    <p className="text-xs text-base-content/60">Interaction #{interactionId}</p>
                </div>
                <button onClick={onClose} className="btn btn-xs btn-ghost" aria-label="Close dialog">
                    ✕
                </button>
            </div>

            {!metadata || Object.keys(metadata).length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/40">
                    <p className="px-4 py-8 text-center text-sm text-base-content/60">No metadata available</p>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden rounded-lg border border-base-300 bg-base-200/40">
                    <div className="h-full overflow-y-auto p-4 space-y-4">
                        {renderSection('Prospect Information', metadata.prospect)}
                        {renderSection('Company Information', metadata.company)}
                        {renderSection('Call Context', metadata.context)}
                        {renderSection('Communication Patterns', metadata.communication)}

                        {metadata.extractedAt && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-base-content/80">Extraction Info</h4>
                                <div className="rounded-lg border border-base-300 bg-base-100 p-3">
                                    <p className="text-xs text-base-content/60">
                                        Extracted at:{' '}
                                        <span className="text-base-content/90">{new Date(metadata.extractedAt).toLocaleString()}</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Raw JSON view for debugging */}
                        <details className="mt-4">
                            <summary className="cursor-pointer text-xs font-medium text-base-content/60 hover:text-base-content/80">
                                View Raw JSON
                            </summary>
                            <div className="mt-2 rounded-lg border border-base-300 bg-base-100 p-3">
                                <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words">
                                    {JSON.stringify(metadata, null, 2)}
                                </pre>
                            </div>
                        </details>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractionMetadataFloatingUI;
