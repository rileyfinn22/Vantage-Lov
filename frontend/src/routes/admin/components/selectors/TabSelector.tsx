import type { TabSelectorProps } from '../types';

export default function TabSelector({
    tabs,
    searchParams,
    setSearchParams,
    paramName = 'tab',
    defaultTab,
    className = '',
}: TabSelectorProps) {
    const activeTab = searchParams.get(paramName) ?? defaultTab ?? tabs[0]?.key ?? '';

    const handleTabChange = (tabKey: string) => {
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.set(paramName, tabKey);
        setSearchParams(newSearchParams);
    };

    return (
        <div className={`tabs tabs-boxed w-full mb-4 ${className}`}>
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    className={`tab tab-lg flex-1 ${activeTab === tab.key ? 'tab-active' : ''}`}
                    onClick={() => handleTabChange(tab.key)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
