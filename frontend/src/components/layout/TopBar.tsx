import { useStore } from '@nanostores/react';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { formatDateTime } from '#util';
import { useNotificationsData, useMarkNotificationRead, useDismissNotification, type Notification } from '#data/notifications';
import { useAuth, useMe } from '#util/useMe';
import { $themeMode, toggleTheme } from '../../stores/theme';

interface TopBarProps {
    onMenuToggle?: () => void;
    companyName?: string;
}

export function TopBar({ onMenuToggle, companyName = 'Acme Corp' }: TopBarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const themeMode = useStore($themeMode);
    const { user, logout } = useAuth();
    const { roles } = useMe();
    const [, navigate] = useLocation();

    // Fetch notifications data
    const { data: notifications, isPending: notificationsLoading, error: notificationsError } = useNotificationsData();
    const markAsRead = useMarkNotificationRead();
    const dismissMutation = useDismissNotification();

    const isAdmin = roles?.siteRoles?.includes('admin');

    // Filter unread notifications
    const unreadNotifications = notifications?.filter((n: Notification) => n.status === 'unread') ?? [];
    const unreadCount = unreadNotifications.length;

    // Handlers for notification actions
    const handleNotificationRead = (notificationId: number) => {
        markAsRead.mutate(notificationId);
    };

    const handleNotificationDismiss = (notificationId: number) => {
        dismissMutation.mutate(notificationId);
    };

    const getNotificationIcon = (type: Notification['type']) => {
        switch (type) {
            case 'error':
                return <XCircle className="w-4 h-4 text-error" />;
            case 'warning':
                return <AlertCircle className="w-4 h-4 text-warning" />;
            case 'success':
                return <CheckCircle className="w-4 h-4 text-success" />;
            default:
                return <Info className="w-4 h-4 text-info" />;
        }
    };

    return (
        <div className="navbar bg-base-200 border-b border-base-content/20 sticky top-0 z-40">
            <div className="navbar-start">
                <button className="btn btn-square btn-ghost lg:hidden" onClick={onMenuToggle}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                <div className="flex items-center gap-4">
                    <div className="text-xl font-bold text-primary">Vantage.ai</div>

                    <label className="input input-bordered flex items-center gap-2 w-64">
                        <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search calls, reps, or deals..."
                            className="grow"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </label>
                </div>
            </div>

            <div className="navbar-end">
                <div className="flex items-center gap-4">
                    {/* Dark Mode Toggle */}
                    <button
                        className="btn btn-ghost btn-circle"
                        onClick={toggleTheme}
                        title={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}
                    >
                        {themeMode === 'light' ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                                />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                                />
                            </svg>
                        )}
                    </button>

                    {/* Notifications */}
                    <div className="dropdown dropdown-end">
                        <button tabIndex={0} className="btn btn-ghost btn-circle">
                            <div className="indicator">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 17h5l-3-3V9a6 6 0 10-12 0v5l-3 3h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                    />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="badge badge-xs badge-primary indicator-item">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </div>
                        </button>
                        <div className="dropdown-content card card-compact w-80 p-2 shadow bg-base-200 border border-base-content/30">
                            <div className="card-body">
                                <h3 className="font-bold">Notifications</h3>
                                {notificationsLoading ? (
                                    <div className="flex items-center gap-2">
                                        <span className="loading loading-spinner loading-sm"></span>
                                        <span className="text-sm opacity-75">Loading notifications...</span>
                                    </div>
                                ) : notificationsError ? (
                                    <div className="text-sm text-error">Failed to load notifications</div>
                                ) : unreadNotifications.length === 0 ? (
                                    <div className="text-sm opacity-75">No new notifications</div>
                                ) : (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {unreadNotifications.slice(0, 5).map((notification: Notification) => (
                                            <div key={notification.id} className="flex items-start gap-2 p-2 hover:bg-base-200 rounded">
                                                <div className="flex-shrink-0">{getNotificationIcon(notification.type)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm break-words">{notification.message}</div>
                                                    <div className="text-xs opacity-60 mt-1">{formatDateTime(notification.createdAt)}</div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        className="btn btn-xs btn-ghost"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleNotificationRead(notification.id);
                                                        }}
                                                        title="Mark as read"
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        className="btn btn-xs btn-ghost"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleNotificationDismiss(notification.id);
                                                        }}
                                                        title="Dismiss"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {unreadNotifications.length > 5 && (
                                            <div className="text-xs text-center opacity-60 pt-2 border-t">
                                                +{unreadNotifications.length - 5} more notifications
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* User Menu */}
                    <div className="dropdown dropdown-end">
                        <button type="button" tabIndex={0} className="btn btn-ghost btn-sm gap-2">
                            <div className="avatar-placeholder avatar">
                                <div className="bg-primary text-primary-content rounded-full w-8">
                                    <span className="text-xs font-bold">{user?.email?.charAt(0).toUpperCase() ?? 'U'}</span>
                                </div>
                            </div>
                            <div className="hidden md:flex flex-col items-start">
                                <span className="text-sm font-medium">{companyName}</span>
                                <span className="text-xs opacity-70">{user?.email}</span>
                            </div>
                        </button>
                        <ul className="dropdown-content menu p-2 shadow bg-base-200 border border-base-content/30 rounded-box w-52 mt-2">
                            <li className="menu-title">
                                <span>{user?.email}</span>
                            </li>
                            {isAdmin && (
                                <li>
                                    <button onClick={() => navigate('/admin')}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                            />
                                        </svg>
                                        Admin Settings
                                    </button>
                                </li>
                            )}
                            <li>
                                <button onClick={logout} className="text-error">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                        />
                                    </svg>
                                    Logout
                                </button>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
