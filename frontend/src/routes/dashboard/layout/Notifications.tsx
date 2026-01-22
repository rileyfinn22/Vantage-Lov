import { map } from 'nanostores';
import { useStore } from '@nanostores/react';

export interface Notification {
    id: string;
    message: string;
    type: 'error' | 'success' | 'warning' | 'info';
    timestamp: number;
}

// Nanostores map to store notifications by timestamp
export const $notifications = map<Record<string, Notification>>({});

// Function to add a notification
export const addNotification = (message: string, type: Notification['type'] = 'info') => {
    const timestamp = Date.now();
    const id = timestamp.toString();
    const notification: Notification = {
        id,
        message,
        type,
        timestamp,
    };

    $notifications.setKey(id, notification);

    // Auto-remove after 5 seconds for success and info, 8 seconds for warning and error
    // const timeout = type === 'error' || type === 'warning' ? 8000 : 5000;
    // setTimeout(() => {
    //     removeNotification(id);
    // }, timeout);

    return id;
};

// Function to remove a notification
export const removeNotification = (id: string) => {
    const current = $notifications.get();
    const { [id]: removed, ...rest } = current;
    $notifications.set(rest);
};

// React component to render notifications
export const Notifications = () => {
    const notifications = useStore($notifications);
    const notificationList = Object.values(notifications);

    if (notificationList.length === 0) {
        return null;
    }

    const getAlertClass = (type: Notification['type']) => {
        switch (type) {
            case 'error':
                return 'alert-error';
            case 'success':
                return 'alert-success';
            case 'warning':
                return 'alert-warning';
            default:
                return 'alert-info';
        }
    };

    return (
        <div className="toast toast-top toast-end z-[60]">
            {notificationList
                .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
                .map((notification) => (
                    <div key={notification.id} className={`alert ${getAlertClass(notification.type)} shadow-lg`}>
                        <div className="flex-1">
                            <span>{notification.message}</span>
                        </div>
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => removeNotification(notification.id)}
                            aria-label="Close notification"
                        >
                            ✕
                        </button>
                    </div>
                ))}
        </div>
    );
};
