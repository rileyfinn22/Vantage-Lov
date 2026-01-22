import { useSearchParams } from 'wouter';

interface ResourceSelectorProps {
    availableResources: string[];
    resourceCustomizations: Record<string, any>;
}

const ResourceSelector = ({ availableResources, resourceCustomizations }: ResourceSelectorProps) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedResource = searchParams.get('table') ?? 'company';

    const handleResourceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('table', event.target.value);
        setSearchParams(Object.fromEntries(newParams));
    };

    return (
        <div className="p-4 border-b border-base-300">
            <div className="flex items-center gap-4">
                <label htmlFor="resource-selector" className="label">
                    <span className="label-text font-semibold">Select Table:</span>
                </label>
                <select
                    id="resource-selector"
                    className="select select-bordered w-full max-w-xs"
                    value={selectedResource}
                    onChange={handleResourceChange}
                >
                    {availableResources.map((resource) => {
                        const isCustomized = resource in resourceCustomizations;
                        return (
                            <option key={resource} value={resource}>
                                {resource} {isCustomized ? '⚡' : ''}
                            </option>
                        );
                    })}
                </select>
                <div className="text-sm text-base-content/70">{availableResources.length} tables available</div>
            </div>
        </div>
    );
};

export default ResourceSelector;
