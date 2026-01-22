import { TodoPage } from '#components/TodoPage';
import { Users } from 'lucide-react';

export function TeamPage() {
    return (
        <TodoPage
            title="Team Management"
            description="Comprehensive team management dashboard for sales leaders to monitor, coach, and optimize team performance."
            icon={<Users className="w-20 h-20" />}
            features={[
                'Team performance overview and metrics',
                'Individual rep performance tracking',
                'Team hierarchy and organization charts',
                'Coaching session scheduling and notes',
                'Goal setting and milestone tracking',
                'Team communication and announcements',
                'Performance comparison and rankings',
                'Territory and quota management',
                'Onboarding workflows for new hires',
                'Team training coordination',
            ]}
        />
    );
}
