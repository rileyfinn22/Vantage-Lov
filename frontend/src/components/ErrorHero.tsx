import { useLocation } from 'wouter';
import { AlertTriangle } from 'lucide-react';

interface ErrorHeroProps {
    title: string;
    message: string;
    showAdminButton?: boolean;
    icon?: React.ReactNode;
}

export function ErrorHero({ title, message, showAdminButton = false, icon = <AlertTriangle className="w-16 h-16" /> }: ErrorHeroProps) {
    const [, navigate] = useLocation();

    return (
        <div className="hero min-h-screen bg-base-200">
            <div className="hero-content text-center">
                <div className="max-w-md">
                    <div className="flex justify-center mb-4">{icon}</div>
                    <h1 className="text-5xl font-bold text-base-content">{title}</h1>
                    <p className="py-6 text-base-content/70">{message}</p>

                    {showAdminButton && (
                        <div className="space-y-4">
                            <button className="btn btn-primary" onClick={() => navigate('/admin')}>
                                Go to Admin Dashboard
                            </button>
                            <p className="text-sm text-base-content/50">Access administrative features and manage the platform</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
