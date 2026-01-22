import { createAuthClient } from 'better-auth/react';
import { useQuery } from '@tanstack/react-query';
import { ho } from '#data/client';
import type { ExtractData } from '#data/types';

type User = {
    id: string;
    name: string;
    email: string;
    image?: string;
    emailVerified?: boolean;
    createdAt?: string;
    updatedAt?: string;
};

type CompanyRole = {
    companyId: string;
    companyName: string;
    role: string;
};

type UserRoles = {
    siteRoles: string[];
    companyRoles: CompanyRole[];
};

type MyUserData = {
    user: User;
    roles: UserRoles;
};

type SalesDetail = ExtractData<(typeof ho.vantage.api.salespeople.me)['$get']>;

const { useSession, signIn, signOut } = createAuthClient();

export const useAuth = () => {
    const { data, isPending, error } = useSession();

    const login = async (email: string, password: string) => {
        const { error } = await signIn.email({ email, password });
        if (error) {
            throw new Error(error.message);
        }
        window.location.reload();
    };

    const logout = async () => {
        const { error } = await signOut();
        if (error) {
            throw new Error(error.message);
        }
        window.location.reload();
    };

    return {
        user:
            data?.user &&
            ({
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
            } satisfies User),
        isAuthenticated: !!data?.user && !isPending,
        loading: isPending,
        error,
        login,
        logout,
    };
};

export function useMyUserData() {
    return useQuery({
        queryKey: ['myuser'],
        queryFn: async () => {
            const response = await ho.vantage.api.myuser.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch user data');
            }
            return response.json() as Promise<MyUserData>;
        },
        retry: false,
    });
}

export function useMySalesData() {
    return useQuery({
        queryKey: ['salespeople', 'me'],
        queryFn: async () => {
            const response = await ho.vantage.api.salespeople.me.$get();
            if (!response.ok) {
                throw new Error('Failed to fetch sales data');
            }
            return response.json() as Promise<SalesDetail>;
        },
        retry: false,
    });
}

export const useMe = () => {
    const { data: myUserData, isPending: myUserLoading, error: myUserError } = useMyUserData();
    const { data: salesData, isPending: salesLoading, error: salesError } = useMySalesData();

    return {
        userData: myUserData,
        salesData,
        roles: myUserData?.roles,
        loading: myUserLoading || salesLoading,
        error: myUserError || salesError,
    };
};
