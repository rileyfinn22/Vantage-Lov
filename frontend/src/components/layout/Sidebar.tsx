import { useState } from 'react';
import { useLocation } from 'wouter';
import { LayoutDashboard, TrendingUp, GraduationCap, Users, Phone, Flag, Settings, Upload, CalendarCheck, FlaskConical } from 'lucide-react';

interface NavItem {
    title: string;
    url: string;
    icon: React.ReactNode;
    roles: string[];
}

const mainNavItems: NavItem[] = [
    { title: 'Dashboard', url: '/', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['manager', 'rep'] },
    { title: 'Insights', url: '/insights', icon: <TrendingUp className="w-5 h-5" />, roles: ['manager', 'rep'] },
    { title: 'Training', url: '/training', icon: <GraduationCap className="w-5 h-5" />, roles: ['manager', 'rep'] },
    { title: 'Meeting Prep', url: '/prep', icon: <CalendarCheck className="w-5 h-5" />, roles: ['manager', 'rep'] },
    { title: 'Team', url: '/team', icon: <Users className="w-5 h-5" />, roles: ['manager'] },
    { title: 'Call Library', url: '/calls', icon: <Phone className="w-5 h-5" />, roles: ['manager', 'rep'] },
    { title: 'Upload Call', url: '/upload-call', icon: <Upload className="w-5 h-5" />, roles: ['manager', 'rep'] },
    { title: 'Flag Tuning', url: '/flag-tuning', icon: <Flag className="w-5 h-5" />, roles: ['manager'] },
];

const adminNavItems: NavItem[] = [
    { title: 'Admin Settings', url: '/admin', icon: <Settings className="w-5 h-5" />, roles: ['admin'] },
    { title: 'Prompt Workbench', url: '/prompt-workbench', icon: <FlaskConical className="w-5 h-5" />, roles: ['admin'] },
];

interface SidebarProps {
    userRole?: string;
    isAdmin?: boolean;
}

export function Sidebar({ userRole = 'manager', isAdmin = false }: SidebarProps) {
    const [location, navigate] = useLocation();
    const [collapsed, setCollapsed] = useState(false);

    const filteredMainNavItems = mainNavItems.filter((item) => item.roles.includes(userRole));

    const filteredAdminNavItems = isAdmin ? adminNavItems : [];

    const isActive = (path: string) => {
        if (path === '/') {
            return location === '/' || location === '/dashboard';
        }
        return location.startsWith(path);
    };

    const handleNavClick = (url: string) => {
        navigate(url);
    };

    return (
        <div
            className={`
      bg-base-200 border-r border-base-content/20 min-h-screen
      w-80 ${collapsed ? 'lg:w-14' : 'lg:w-56'}
      transition-all duration-300
    `}
        >
            <div className="flex flex-col h-full">
                {/* Collapse button - only show on desktop */}
                <div className="hidden lg:block p-4 border-b border-base-content/20">
                    <button className="btn btn-ghost btn-sm w-full justify-start" onClick={() => setCollapsed(!collapsed)}>
                        <span className="text-lg">{collapsed ? '→' : '←'}</span>
                        {!collapsed && <span className="ml-2">Collapse</span>}
                    </button>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto">
                    {/* Main Navigation */}
                    <div className="p-2">
                        <h3 className="lg:hidden text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-3">Navigation</h3>
                        {!collapsed && (
                            <h3 className="hidden lg:block text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-3">
                                Navigation
                            </h3>
                        )}
                        <ul className="menu p-0 space-y-1">
                            {filteredMainNavItems.map((item) => (
                                <li key={item.title}>
                                    <button
                                        onClick={() => handleNavClick(item.url)}
                                        className={`
                        flex items-center w-full text-left
                        ${isActive(item.url) ? 'active bg-primary text-primary-content' : 'hover:bg-base-300'}
                      `}
                                    >
                                        {item.icon}
                                        <span className="ml-3 text-sm font-medium lg:hidden">{item.title}</span>
                                        {!collapsed && <span className="ml-3 text-sm font-medium hidden lg:inline">{item.title}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Admin Section */}
                    {filteredAdminNavItems.length > 0 && (
                        <div className="p-2 border-t border-base-content/20">
                            <h3 className="lg:hidden text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-3">Admin</h3>
                            {!collapsed && (
                                <h3 className="hidden lg:block text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-3">
                                    Admin
                                </h3>
                            )}
                            <ul className="menu p-0 space-y-1">
                                {filteredAdminNavItems.map((item) => (
                                    <li key={item.title}>
                                        <button
                                            data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                                            onClick={() => handleNavClick(item.url)}
                                            className={`
                          flex items-center w-full text-left
                          ${isActive(item.url) ? 'active bg-primary text-primary-content' : 'hover:bg-base-300'}
                        `}
                                        >
                                            {item.icon}
                                            <span className="ml-3 text-sm font-medium lg:hidden">{item.title}</span>
                                            {!collapsed && <span className="ml-3 text-sm font-medium hidden lg:inline">{item.title}</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
