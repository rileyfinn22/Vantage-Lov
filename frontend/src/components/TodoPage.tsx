import { useLocation } from 'wouter';
import { Construction, ClipboardList, Rocket } from 'lucide-react';

interface TodoPageProps {
    title: string;
    description: string;
    features?: string[];
    icon?: React.ReactNode;
}

export function TodoPage({ title, description, features = [], icon = <Construction className="w-20 h-20" /> }: TodoPageProps) {
    const [, navigate] = useLocation();

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
                <div className="flex justify-center mb-6">{icon}</div>
                <h1 className="text-4xl font-bold text-base-content mb-4">{title}</h1>
                <p className="text-xl text-base-content/70 max-w-2xl mx-auto">{description}</p>
            </div>

            {/* Features Section */}
            {features.length > 0 && (
                <div className="card bg-base-200 shadow-lg mb-8">
                    <div className="card-body">
                        <h2 className="card-title text-2xl mb-6">
                            <ClipboardList className="w-6 h-6" /> Planned Features
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {features.map((feature) => (
                                <div key={feature} className="flex items-start gap-3">
                                    <div className="checkbox checkbox-primary opacity-50 cursor-not-allowed"></div>
                                    <span className="text-base-content/80">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                    ← Back to Dashboard
                </button>
                <button className="btn btn-outline" onClick={() => navigate('/insights')}>
                    View Insights Instead
                </button>
            </div>

            {/* Status Badge */}
            <div className="flex justify-center mt-8">
                <div className="badge badge-warning badge-lg gap-2">
                    <Rocket className="w-4 h-4" /> Coming Soon
                </div>
            </div>
        </div>
    );
}
