import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from './client';

export interface CRMConnection {
    id: number;
    provider: 'hubspot' | 'zoho' | 'agilecrm';
    status: 'connected' | 'disconnected' | 'error' | 'expired';
    providerAccountName: string | null;
    connectedUserEmail: string | null;
    lastSyncAt: string | null;
    contactsCount: number | null;
    companiesCount: number | null;
    dealsCount: number | null;
    createdAt: string;
}

export interface HubSpotContact {
    id: string;
    properties: {
        email?: string;
        firstname?: string;
        lastname?: string;
        phone?: string;
        jobtitle?: string;
        company?: string;
        lifecyclestage?: string;
    };
}

export interface HubSpotCompany {
    id: string;
    properties: {
        name?: string;
        domain?: string;
        industry?: string;
        numberofemployees?: string;
        annualrevenue?: string;
    };
}

export interface HubSpotDeal {
    id: string;
    properties: {
        dealname?: string;
        amount?: string;
        dealstage?: string;
        closedate?: string;
    };
}

// Get CRM connection status
export function useCRMStatus() {
    return useQuery({
        queryKey: ['crm', 'status'],
        queryFn: async () => {
            const res = await ho.vantage.api.crm.status.$get();
            if (!res.ok) throw new Error('Failed to get CRM status');
            return res.json();
        },
    });
}

// Initiate HubSpot OAuth
export function useConnectHubSpot() {
    return useMutation({
        mutationFn: async () => {
            const res = await ho.vantage.api.crm.hubspot.connect.$get();
            if (!res.ok) throw new Error('Failed to initiate HubSpot OAuth');
            return res.json();
        },
        onSuccess: (data) => {
            // Redirect to HubSpot OAuth page
            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        },
    });
}

// Disconnect HubSpot
export function useDisconnectHubSpot() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const res = await ho.vantage.api.crm.hubspot.$delete();
            if (!res.ok) throw new Error('Failed to disconnect HubSpot');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['crm', 'status'] });
        },
    });
}

// Manual sync trigger
export function useSyncHubSpot() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const res = await ho.vantage.api.crm.hubspot.sync.$post();
            if (!res.ok) throw new Error('Failed to sync HubSpot');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['crm', 'status'] });
        },
    });
}

// Get HubSpot contacts
export function useHubSpotContacts(limit = 100) {
    return useQuery({
        queryKey: ['crm', 'hubspot', 'contacts', limit],
        queryFn: async () => {
            const res = await ho.vantage.api.crm.hubspot.contacts.$get({
                query: { limit: String(limit) },
            });
            if (!res.ok) throw new Error('Failed to get contacts');
            return res.json() as Promise<{ results: HubSpotContact[]; total: number }>;
        },
        enabled: false, // Only fetch when explicitly requested
    });
}

// Get HubSpot companies
export function useHubSpotCompanies(limit = 100) {
    return useQuery({
        queryKey: ['crm', 'hubspot', 'companies', limit],
        queryFn: async () => {
            const res = await ho.vantage.api.crm.hubspot.companies.$get({
                query: { limit: String(limit) },
            });
            if (!res.ok) throw new Error('Failed to get companies');
            return res.json() as Promise<{ results: HubSpotCompany[]; total: number }>;
        },
        enabled: false,
    });
}

// Get HubSpot deals
export function useHubSpotDeals(limit = 100) {
    return useQuery({
        queryKey: ['crm', 'hubspot', 'deals', limit],
        queryFn: async () => {
            const res = await ho.vantage.api.crm.hubspot.deals.$get({
                query: { limit: String(limit) },
            });
            if (!res.ok) throw new Error('Failed to get deals');
            return res.json() as Promise<{ results: HubSpotDeal[]; total: number }>;
        },
        enabled: false,
    });
}

// Search contact by email
export function useSearchHubSpotContact(email: string) {
    return useQuery({
        queryKey: ['crm', 'hubspot', 'contacts', 'search', email],
        queryFn: async () => {
            const res = await ho.vantage.api.crm.hubspot.contacts.search.$get({
                query: { email },
            });
            if (!res.ok) throw new Error('Failed to search contacts');
            return res.json() as Promise<{ contact: HubSpotContact | null }>;
        },
        enabled: !!email && email.includes('@'),
    });
}
