import { useLocation } from 'wouter';
import { Plus, Building2, Calendar, Target, Trash2 } from 'lucide-react';
import { useMeetingPreps, useDeleteMeetingPrep, type MeetingPrep } from '#data/meetingPrep';

const callTypeLabels: Record<MeetingPrep['callType'], string> = {
    discovery: 'Discovery',
    demo: 'Demo',
    negotiation: 'Negotiation',
    closing: 'Closing',
    follow_up: 'Follow-up',
};

const statusColors: Record<MeetingPrep['status'], string> = {
    setup: 'badge-warning',
    ready: 'badge-info',
    practiced: 'badge-success',
};

const statusLabels: Record<MeetingPrep['status'], string> = {
    setup: 'Setup',
    ready: 'Ready',
    practiced: 'Practiced',
};

function PrepCard({ prep, onDelete }: { prep: MeetingPrep; onDelete: (id: number) => void }) {
    const [, navigate] = useLocation();

    const handleClick = () => {
        navigate(`/prep/${prep.id}`);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this prep?')) {
            onDelete(prep.id);
        }
    };

    return (
        <div
            className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-base-300"
            onClick={handleClick}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
            tabIndex={0}
            role="button"
        >
            <div className="card-body p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-4 h-4 text-base-content/60" />
                            <h3 className="font-semibold text-base">{prep.prospectCompany}</h3>
                        </div>
                        {prep.prospectContactName && (
                            <p className="text-sm text-base-content/70">
                                {prep.prospectContactName}
                                {prep.prospectContactRole && ` - ${prep.prospectContactRole}`}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`badge ${statusColors[prep.status]} badge-sm`}>{statusLabels[prep.status]}</span>
                        <button className="btn btn-ghost btn-xs text-error hover:bg-error/10" onClick={handleDelete} title="Delete prep">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                    <div className="flex items-center gap-1 text-xs text-base-content/60">
                        <Target className="w-3 h-3" />
                        <span>{callTypeLabels[prep.callType]}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-base-content/60">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(prep.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>

                <p className="text-sm text-base-content/80 mt-2 line-clamp-2">{prep.meetingGoal}</p>
            </div>
        </div>
    );
}

export function PrepListPage() {
    const [, navigate] = useLocation();
    const { data, isLoading, error } = useMeetingPreps();
    const deleteMutation = useDeleteMeetingPrep();

    const handleNewPrep = () => {
        navigate('/prep/new');
    };

    const handleDelete = (id: number) => {
        deleteMutation.mutate(id);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-error">
                <span>Failed to load meeting preps</span>
            </div>
        );
    }

    const preps = (data?.preps ?? []) as MeetingPrep[];

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Meeting Prep</h1>
                    <p className="text-base-content/70">Prepare for upcoming meetings with AI-powered guidance</p>
                </div>
                <button className="btn btn-primary" onClick={handleNewPrep}>
                    <Plus className="w-4 h-4" />
                    New Prep
                </button>
            </div>

            {preps.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-base-content/40 mb-4">
                        <Building2 className="w-16 h-16 mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No meeting preps yet</h3>
                    <p className="text-base-content/70 mb-4">Create your first meeting prep to get started</p>
                    <button className="btn btn-primary" onClick={handleNewPrep}>
                        <Plus className="w-4 h-4" />
                        Create Prep
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {preps.map((prep) => (
                        <PrepCard key={prep.id} prep={prep} onDelete={handleDelete} />
                    ))}
                </div>
            )}
        </div>
    );
}
