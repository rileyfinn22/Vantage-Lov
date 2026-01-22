import { Refine } from '@refinedev/core';
import provider from '@refinedev/simple-rest';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'wouter';
import { ho } from '#data/client';

// Import extracted components
import SalespeopleTable from './components/tables/SalespeopleTable';
import CompanyTable from './components/tables/CompanyTable';
import GenericCRUDTable from './components/tables/GenericCRUDTable';
import ResourceSelector from './components/selectors/ResourceSelector';
import CompanySelector from './components/selectors/CompanySelector';
import TabSelector from './components/selectors/TabSelector';
import SystemPromptSettings from './components/forms/SystemPromptSettings';
import CompanyContext from './CompanyContext';
import type { TablesResponse, GenericCRUDTableProps, TabConfig } from './components/types';

// Admin tables hook
function useAdminTables() {
    return useQuery({
        queryKey: ['admin', 'tables'],
        queryFn: async () => {
            const response = await ho.vantage.api.admin.crud.tables.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch admin tables');
            }
            return response.json() as Promise<TablesResponse>;
        },
        retry: false,
    });
}

// Resource customization map
const RESOURCE_CUSTOMIZATIONS = {
    salespeople: {
        render: (props: GenericCRUDTableProps) => <SalespeopleTable {...props} />,
    },
} as const;

export function VantageRefined() {
    const dataProvider = provider('/vantage/api/admin/crud');
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedResource = searchParams.get('table') ?? 'company';
    const { data: adminTablesData } = useAdminTables();
    const availableResources = adminTablesData?.tables ?? [];
    const activeTab = searchParams.get('tab') ?? 'salespeople';

    const tabs: TabConfig[] = [
        { key: 'salespeople', label: 'Salespeople', priority: 1 },
        { key: 'companies', label: 'Companies', priority: 2 },
        { key: 'context', label: 'Company Context', priority: 3 },
        { key: 'crud', label: 'CRUD', priority: 4 },
        { key: 'settings', label: 'Prompt Settings', priority: 5 },
    ];

    const ourQuery = useQueryClient();
    const defaultOptions = { reactQuery: { clientConfig: ourQuery } };

    return (
        <Refine options={defaultOptions} dataProvider={dataProvider}>
            <div>
                <TabSelector
                    tabs={tabs}
                    searchParams={searchParams}
                    setSearchParams={setSearchParams}
                    paramName="tab"
                    defaultTab="salespeople"
                />

                {activeTab === 'salespeople' && (
                    <>
                        <CompanySelector />
                        <SalespeopleTable resource="salespeople" />
                    </>
                )}

                {activeTab === 'companies' && <CompanyTable />}

                {activeTab === 'context' && <CompanyContext />}

                {activeTab === 'crud' && (
                    <>
                        <ResourceSelector availableResources={availableResources} resourceCustomizations={RESOURCE_CUSTOMIZATIONS} />
                        <GenericCRUDTable resource={selectedResource} />
                    </>
                )}

                {activeTab === 'settings' && <SystemPromptSettings />}
            </div>
        </Refine>
    );
}
