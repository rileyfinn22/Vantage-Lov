import { useState, useRef } from 'react';
import { Users, ChevronDown, Check } from 'lucide-react';
import { useDashboardData } from '#data/dashboard';
import { useAssignBattleCard } from '#data/training-assignments';

interface AssignToTeamDropdownProps {
    battleCardId: number;
    battleCardTitle: string;
}

export function AssignToTeamDropdown({ battleCardId, battleCardTitle }: AssignToTeamDropdownProps) {
    const [selectedReps, setSelectedReps] = useState<number[]>([]);
    const [selectAll, setSelectAll] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const detailsRef = useRef<HTMLDetailsElement>(null);

    const { data: dashboardData, isPending: loading } = useDashboardData();
    const assignMutation = useAssignBattleCard();

    const reps = dashboardData?.leaderboard ?? [];

    const handleRepToggle = (repId: number) => {
        setSelectedReps((prev) => {
            const newSelection = prev.includes(repId) ? prev.filter((id) => id !== repId) : [...prev, repId];
            setSelectAll(newSelection.length === reps.length);
            return newSelection;
        });
    };

    const handleSelectAll = () => {
        if (selectAll) {
            setSelectedReps([]);
            setSelectAll(false);
        } else {
            setSelectedReps(reps.map((rep) => rep.id));
            setSelectAll(true);
        }
    };

    const handleAssign = async () => {
        if (selectedReps.length === 0) return;

        const selectedNames: string[] = [];

        for (const repId of selectedReps) {
            const rep = reps.find((r) => r.id === repId);
            if (rep) {
                selectedNames.push(`${rep.firstName} ${rep.lastName}`);
                await assignMutation.mutateAsync({
                    salespersonId: repId,
                    battleCardId: String(battleCardId),
                    title: `Battle Card: ${battleCardTitle}`,
                    description: `Training assignment for the "${battleCardTitle}" battle card`,
                });
            }
        }

        setSuccessMessage(`Assigned to ${selectedNames.join(', ')}`);
        setTimeout(() => setSuccessMessage(null), 3000);

        // Reset selections
        setSelectedReps([]);
        setSelectAll(false);

        // Close dropdown
        if (detailsRef.current) {
            detailsRef.current.open = false;
        }
    };

    const getButtonText = () => {
        if (selectedReps.length === 0) return 'Assign to Team';
        if (selectAll) return `Assign to All (${reps.length})`;
        return `Assign to ${selectedReps.length} Rep${selectedReps.length > 1 ? 's' : ''}`;
    };

    if (loading) {
        return (
            <button className="btn btn-primary btn-sm" disabled>
                <span className="loading loading-spinner loading-xs"></span>
                Loading...
            </button>
        );
    }

    return (
        <details ref={detailsRef} className="dropdown dropdown-end">
            <summary className="btn btn-primary btn-sm">
                <Users className="w-4 h-4" />
                {getButtonText()}
                <ChevronDown className="w-4 h-4" />
            </summary>
            <div className="dropdown-content z-50 bg-base-200 rounded-box w-64 p-2 shadow-lg border border-base-content/30 mt-1">
                {successMessage && (
                    <div className="alert alert-success py-2 mb-2 text-sm">
                        <Check className="w-4 h-4" />
                        {successMessage}
                    </div>
                )}

                {/* Select All Option */}
                <label className="flex items-center gap-2 p-2 cursor-pointer hover:bg-base-300 rounded-btn font-medium border-b border-base-content/20 mb-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={selectAll}
                        onChange={handleSelectAll}
                    />
                    Select All Team Members
                </label>

                {/* Individual Reps */}
                <div className="max-h-48 overflow-y-auto">
                    {reps.map((rep) => (
                        <label key={rep.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-base-200 rounded-btn">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-primary"
                                checked={selectedReps.includes(rep.id)}
                                onChange={() => handleRepToggle(rep.id)}
                            />
                            <div>
                                <div className="font-medium">
                                    {rep.firstName} {rep.lastName}
                                </div>
                            </div>
                        </label>
                    ))}
                </div>

                {/* Assign Button */}
                <div className="pt-2 mt-2 border-t border-base-300">
                    <button
                        className="btn btn-primary btn-sm w-full"
                        onClick={handleAssign}
                        disabled={selectedReps.length === 0 || assignMutation.isPending}
                    >
                        {assignMutation.isPending ? (
                            <>
                                <span className="loading loading-spinner loading-xs"></span>
                                Assigning...
                            </>
                        ) : (
                            'Assign Selected'
                        )}
                    </button>
                </div>
            </div>
        </details>
    );
}
