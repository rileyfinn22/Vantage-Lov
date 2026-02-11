import { useState, type ReactNode } from 'react';
import { TopBar } from '#components/layout/TopBar';
import { Sidebar } from '#components/layout/Sidebar';
import { useMe } from '#util/useMe';

interface DashboardLayoutProps {
    children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { userData } = useMe();

    const companyName = userData?.roles?.companyRoles?.[0]?.companyName ?? 'Unknown Company';
    // User is admin if they have site admin role OR company admin role
    const isSiteAdmin = userData?.roles?.siteRoles?.includes('admin') ?? false;
    const isCompanyAdmin = userData?.roles?.companyRoles?.some((role) => role.role === 'admin') ?? false;
    const isAdmin = isSiteAdmin || isCompanyAdmin;

    return (
        <div className="drawer lg:drawer-open">
            <input
                id="main-drawer"
                type="checkbox"
                className="drawer-toggle"
                checked={sidebarOpen}
                onChange={(e) => setSidebarOpen(e.target.checked)}
            />

            <div className="drawer-content flex flex-col min-h-screen bg-base-100">
                <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} companyName={companyName} />

                <main className="flex-1 p-6 overflow-auto">
                    <div className="max-w-7xl mx-auto">{children}</div>
                </main>
            </div>

            <div className="drawer-side">
                <label htmlFor="main-drawer" aria-label="Close drawer" className="drawer-overlay"></label>
                <Sidebar userRole="manager" isAdmin={isAdmin} />
            </div>
        </div>
    );
}
