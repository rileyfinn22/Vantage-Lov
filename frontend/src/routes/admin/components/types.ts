// Shared types for admin components

export interface GenericCRUDTableProps {
    resource: string;
}

export interface DetailsDropdownProps {
    trigger: React.ReactNode;
    data: Record<string, any> | null;
    title: string;
}

export type InteractionFile = {
    id: number;
    fileName: string;
};

export interface FileUploadProps {
    interactionId: number;
    onUploadComplete: () => void;
    className?: string;
    existingFiles?: InteractionFile[];
}

export type TablesResponse = {
    tables: string[];
};

export interface TabConfig {
    key: string;
    label: string;
    priority?: number;
}

export interface TabSelectorProps {
    tabs: TabConfig[];
    searchParams: URLSearchParams;
    setSearchParams: (params: URLSearchParams) => void;
    paramName?: string;
    defaultTab?: string;
    className?: string;
}
