import { TodoPage } from '#components/TodoPage';
import { GraduationCap } from 'lucide-react';

export function TrainingPage() {
    return (
        <TodoPage
            title="Training Module"
            description="Comprehensive sales training and development platform for improving team performance and skills."
            icon={<GraduationCap className="w-20 h-20" />}
            features={[
                'Interactive training modules and courses',
                'Skill assessment and progress tracking',
                'Personalized learning paths for each rep',
                'Training flag resolution workflows',
                'Performance improvement recommendations',
                'Video tutorials and best practices',
                'Certification tracking and badges',
                'Team training schedules and calendar',
            ]}
        />
    );
}
