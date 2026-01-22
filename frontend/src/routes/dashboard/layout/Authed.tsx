import type { ReactNode } from 'react';
import { useAuth } from '#util/useMe';
import { Redirect } from 'wouter';
import { Notifications } from './Notifications';

const Authed = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated, loading, error } = useAuth();

    const fallback = <div className="h-screen bg-gray-100 skeleton"></div>;

    if (loading) return fallback;

    if (!isAuthenticated || error) {
        return <Redirect to="/login" />;
    }

    return (
        <>
            {children}
            <Notifications />
        </>
    );
};

export default Authed;
