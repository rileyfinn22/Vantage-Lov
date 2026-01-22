import { tw } from '#util/tw';
import { formatCurrency, getPerformanceColor, getProgressColor, getBriefFlagTitle, formatTimeAgo } from '#util';
import { useLocation } from 'wouter';
import { LeaderboardEntries, LeaderboardEntry, type LeaderboardEntryProps } from './Entry/LeaderBoard';
import type { useDashboard } from '#data/dashboard.ts';
import type { SalesDetail } from '#data/fetchers.ts';
import { ErrorHero } from '#components/ErrorHero';
import { Briefcase, Flag as FlagIcon, TrendingUp, TrendingDown, Target, BookOpen, Clock, ChevronRight, Trophy } from 'lucide-react';
import { FlagsList } from '#components/dashboard';
import { usePaginatedFlags } from '#data/flags';
import { useSkillsSummary } from '#data/skills';
import { useTrainingAssignments } from '#data/training-assignments';
import { useBattleCards } from '#data/battle-cards';
import { useState } from 'react';
import { GraduationCap } from 'lucide-react';

const Card = tw.div`bg-base-200 rounded-lg border border-base-content/30 shadow-sm`;
const CardHeader = tw.div`p-6 pb-2`;
const CardTitle = tw.h3`text-base font-semibold`;
const CardContent = tw.div`p-0`;

// Helper to get rank badge styling
const getRankBadgeClass = (rank: number) => {
    if (rank === 1) return 'bg-warning text-warning-content';
    if (rank <= 3) return 'bg-base-300 text-base-content';
    return 'bg-base-200 text-base-content/70';
};

export function Dashboard({ leaderboard, star, salesDetails, me, salesError, hoveringSales, focusSales }: ReturnType<typeof useDashboard>) {
    // Check if user is an admin (site-level or company-level)
    const isAdmin = me.userData?.roles?.siteRoles?.includes('admin') || me.userData?.roles?.companyRoles?.some((r) => r.role === 'admin');

    // For admins without salesData, use the first salesperson from leaderboard as default
    const isSalesError = salesError && !me.salesData && !isAdmin;
    const companyName = me.userData?.roles?.companyRoles?.[0]?.companyName ?? 'Unknown Company';
    const [, navigate] = useLocation();

    // Get first salesperson ID from leaderboard for admins without their own salesData
    const defaultSalespersonId = leaderboard[0]?.id ? String(leaderboard[0].id) : '';
    const [selectedRep, setSelectedRep] = useState(
        me.salesData?.salesperson?.id ? String(me.salesData.salesperson.id) : defaultSalespersonId,
    );

    // Get flags for the displayed salesperson
    const salespersonId = salesDetails?.salesperson?.id;
    const { data: flagsData } = usePaginatedFlags(salespersonId ? String(salespersonId) : '', 5);
    const currentFlags = flagsData?.flags ?? [];
    const incompleteFlags = currentFlags.filter((flag: any) => !flag.complete);

    // Get skills summary for the displayed salesperson
    const { data: skillsSummary } = useSkillsSummary(salespersonId ? String(salespersonId) : '');
    const skillsData = skillsSummary?.currentMonth;

    // Get training assignments for the displayed salesperson
    const { data: assignmentsData } = useTrainingAssignments(salespersonId ? String(salespersonId) : undefined);
    const pendingAssignments = assignmentsData?.filter((a: any) => a.status !== 'completed') ?? [];
    const battleCardAssignments = pendingAssignments.filter((a: any) => a.trainingType === 'battle_card');
    const skillsAssignments = pendingAssignments.filter((a: any) => a.trainingType === 'scenario' || a.trainingType === 'skill');

    if (isSalesError) {
        return (
            <ErrorHero
                title="Not a Salesperson"
                message="You don't have access to the sales dashboard. This area is for sales representatives only."
                showAdminButton={true}
                icon={<Briefcase className="w-16 h-16" />}
            />
        );
    }

    if (!salesDetails) {
        return (
            <div className="flex justify-center items-center h-64">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    const { salesperson, revenueMetrics, avgScore } = salesDetails;
    const avgRating = avgScore;
    const monthlyProgress = revenueMetrics.monthlyQuota > 0 ? (revenueMetrics.mtdClosed / revenueMetrics.monthlyQuota) * 100 : 0;

    return (
        <div className="space-y-4">
            {/* Page Header */}
            <div className="border-b border-base-300 pb-2">
                <h1 className="text-xl font-bold">
                    Dashboard for <span className="text-primary">{companyName}</span>
                </h1>
            </div>

            {/* Row A: Leaderboard (5 cols) + Rep Snapshot (3 cols) - Fixed height for 5 reps */}
            <div className="grid grid-cols-1 lg:grid-cols-8 gap-4">
                {/* Team Performance Leaderboard - 5 cols */}
                <div className="lg:col-span-5">
                    <Card className="h-[340px]">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-primary" />
                                    Performance Leaderboard
                                </CardTitle>
                                <span className="badge badge-outline badge-sm">{leaderboard.length} reps</span>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[260px] overflow-y-auto scrollbar-thin">
                                <div className="space-y-0">
                                    {leaderboard.map((entry, index) => {
                                        const isSelected = selectedRep === String(entry.id);
                                        const rank = index + 1;

                                        return (
                                            <div
                                                key={entry.id}
                                                onClick={() => {
                                                    // If already selected, navigate to detail page
                                                    if (isSelected) {
                                                        navigate(`/salesperson/${entry.id}`);
                                                    } else {
                                                        // Otherwise, select and show preview
                                                        setSelectedRep(String(entry.id));
                                                        focusSales(String(entry.id));
                                                    }
                                                }}
                                                className={`flex items-center justify-between p-3 cursor-pointer transition-all duration-200 border-b border-base-300/50 last:border-b-0 ${
                                                    isSelected
                                                        ? 'bg-primary/10 border-l-4 border-l-primary shadow-sm'
                                                        : 'hover:bg-base-200/70'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    {/* Rank Badge */}
                                                    <div
                                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${getRankBadgeClass(rank)}`}
                                                    >
                                                        {rank === 1 ? <Trophy className="h-3 w-3" /> : rank}
                                                    </div>

                                                    {/* Avatar */}
                                                    <div className="avatar">
                                                        <div className="w-8 h-8 rounded-full ring-2 ring-base-200 ring-offset-1 ring-offset-base-100">
                                                            {entry.avatar ? (
                                                                <img src={entry.avatar} alt={entry.firstName} />
                                                            ) : (
                                                                <div className="bg-primary text-primary-content flex items-center justify-center w-full h-full text-xs font-semibold">
                                                                    {entry.firstName?.[0]}
                                                                    {entry.lastName?.[0]}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Name and indicators */}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium truncate">
                                                            {entry.firstName} {entry.lastName}
                                                        </div>
                                                        <div className="flex items-center gap-3 text-xs">
                                                            {entry.flags > 0 && (
                                                                <div className="flex items-center gap-1 text-error">
                                                                    <FlagIcon className="h-3 w-3" />
                                                                    <span>{entry.flags}</span>
                                                                </div>
                                                            )}
                                                            {entry.battleCardTasks > 0 && (
                                                                <div className="flex items-center gap-1 text-warning">
                                                                    <Target className="h-3 w-3" />
                                                                    <span>{entry.battleCardTasks}</span>
                                                                </div>
                                                            )}
                                                            {entry.skillsTasks > 0 && (
                                                                <div className="flex items-center gap-1 text-info">
                                                                    <GraduationCap className="h-3 w-3" />
                                                                    <span>{entry.skillsTasks}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Score */}
                                                <div className="text-right flex-shrink-0">
                                                    <div className={`text-lg font-bold ${getPerformanceColor(entry.score)}`}>
                                                        {entry.score}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Rep Snapshot Card - 3 cols */}
                <div className="lg:col-span-3">
                    <Card
                        className="cursor-pointer h-[340px] hover:shadow-lg transition-all duration-200 group"
                        onClick={() => navigate(`/salesperson/${salespersonId}`)}
                    >
                        <div className="p-6">
                            <div className="space-y-4">
                                {/* Header with rep info and prominent score */}
                                <div className="flex items-start gap-4">
                                    {/* Avatar with ring */}
                                    <div className="avatar">
                                        <div className="w-14 h-14 rounded-full ring-2 ring-primary/20 ring-offset-2 ring-offset-base-100 group-hover:ring-primary/40 transition-all duration-200">
                                            {salesperson.avatar ? (
                                                <img src={salesperson.avatar} alt={salesperson.firstName} />
                                            ) : (
                                                <div className="bg-primary/10 text-primary flex items-center justify-center w-full h-full text-lg font-bold">
                                                    {salesperson.firstName?.[0]}
                                                    {salesperson.lastName?.[0]}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-1">
                                        <h3 className="font-semibold text-lg leading-none group-hover:text-primary transition-colors duration-200">
                                            {salesperson.firstName} {salesperson.lastName}
                                        </h3>
                                        <p className="text-sm text-base-content/70">Sales Rep</p>

                                        {/* Task Indicators */}
                                        <div className="flex items-center gap-3 text-xs pt-1">
                                            {incompleteFlags.length > 0 && (
                                                <div className="flex items-center gap-1 text-error">
                                                    <FlagIcon className="h-3 w-3" />
                                                    <span>
                                                        {incompleteFlags.length} flag{incompleteFlags.length !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            )}
                                            {battleCardAssignments.length > 0 && (
                                                <div className="flex items-center gap-1 text-warning">
                                                    <Target className="h-3 w-3" />
                                                    <span>
                                                        {battleCardAssignments.length} battle card
                                                        {battleCardAssignments.length !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            )}
                                            {skillsAssignments.length > 0 && (
                                                <div className="flex items-center gap-1 text-info">
                                                    <GraduationCap className="h-3 w-3" />
                                                    <span>
                                                        {skillsAssignments.length} skill{skillsAssignments.length !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            )}
                                            {incompleteFlags.length === 0 &&
                                                battleCardAssignments.length === 0 &&
                                                skillsAssignments.length === 0 && (
                                                    <div className="flex items-center gap-1 text-success">
                                                        <Target className="h-3 w-3" />
                                                        <span>All Complete</span>
                                                    </div>
                                                )}
                                        </div>
                                    </div>

                                    {/* Prominent Vantage Score */}
                                    <div className="text-center">
                                        <div className="text-3xl font-black text-primary">{avgRating}</div>
                                        <div className="text-xs text-base-content/70 font-medium">Vantage Score</div>
                                    </div>
                                </div>

                                {/* Performance Trend Section */}
                                <div className="bg-accent/20 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-sm font-medium">Performance Trend</div>
                                        <div className="flex items-center gap-1 text-sm text-success">
                                            <TrendingUp className="h-3 w-3" />
                                            <span className="font-medium">+5.0</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-center">
                                        <svg width="140" height="40" className="w-full max-w-[140px]">
                                            <path
                                                d="M 8 32 L 40.33 26 L 72.67 22 L 105 6"
                                                fill="none"
                                                stroke="hsl(var(--p))"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            <circle cx="8" cy="32" r="2.5" fill="hsl(var(--p))" />
                                            <circle cx="40.33" cy="26" r="2.5" fill="hsl(var(--p))" />
                                            <circle cx="72.67" cy="22" r="2.5" fill="hsl(var(--p))" />
                                            <circle cx="105" cy="6" r="2.5" fill="hsl(var(--p))" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Skills Assessment Preview - Simple 2x2 grid */}
                                <div className="space-y-2">
                                    <div className="text-sm font-medium">Skills Assessment</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'Objection Handling', score: skillsData?.objectionHandling ?? null },
                                            { label: 'Pricing', score: skillsData?.pricingDiscussions ?? null },
                                            { label: 'Discovery', score: skillsData?.discovery ?? null },
                                            { label: 'Closing', score: skillsData?.closing ?? null },
                                        ].map((skill) => (
                                            <div key={skill.label} className="flex items-center justify-between p-2 bg-accent/10 rounded">
                                                <span className="text-xs truncate">{skill.label}</span>
                                                <span
                                                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                                        skill.score === null
                                                            ? 'bg-base-300 text-base-content/50'
                                                            : skill.score >= 8
                                                              ? 'bg-success/20 text-success'
                                                              : skill.score >= 6
                                                                ? 'bg-warning/20 text-warning'
                                                                : 'bg-error/20 text-error'
                                                    }`}
                                                >
                                                    {skill.score !== null ? `${Math.round(skill.score)}/10` : 'N/A'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Row B: Revenue Stats + Training Tasks (50/50 split like lovable) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Revenue Stats Card */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-success" />
                                Revenue Performance
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <div className="p-6 pt-0">
                        <div className="space-y-4">
                            {/* Monthly Progress */}
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-base-content/70">Monthly Progress</span>
                                    <span className="font-medium">{monthlyProgress.toFixed(0)}%</span>
                                </div>
                                <div className="h-2 bg-base-300 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${getProgressColor(monthlyProgress)}`}
                                        style={{ width: `${Math.min(monthlyProgress, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-base-content/60 mt-1">
                                    <span>{formatCurrency(revenueMetrics.mtdClosed)}</span>
                                    <span>{formatCurrency(revenueMetrics.monthlyQuota)}</span>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-base-300/30 rounded-lg">
                                    <div className="text-xs text-base-content/60">MTD Closed</div>
                                    <div className="text-lg font-bold">{formatCurrency(revenueMetrics.mtdClosed)}</div>
                                </div>
                                <div className="p-3 bg-base-300/30 rounded-lg">
                                    <div className="text-xs text-base-content/60">QTD Closed</div>
                                    <div className="text-lg font-bold">{formatCurrency(revenueMetrics.qtdClosed)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Training Tasks */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <FlagIcon className="h-5 w-5 text-error" />
                                Training Tasks
                            </CardTitle>
                            {incompleteFlags.length > 0 && (
                                <span className="badge badge-error badge-sm gap-1">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error-content opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-error-content" />
                                    </span>
                                    {incompleteFlags.length} open
                                </span>
                            )}
                        </div>
                    </CardHeader>
                    <div className="p-6 pt-0">
                        {currentFlags.length === 0 ? (
                            <div className="text-center py-8 bg-success/5 rounded-lg border border-success/20">
                                <div className="text-success mb-2">
                                    <Target className="h-8 w-8 mx-auto" />
                                </div>
                                <p className="text-sm font-medium text-success">All training complete!</p>
                                <p className="text-xs text-base-content/60 mt-1">No pending training tasks</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {currentFlags.slice(0, 3).map((flag: any, index: number) => {
                                    return (
                                        <div
                                            key={flag.id}
                                            className="flex items-center gap-3 p-3 rounded-lg border border-primary transition-all duration-200 cursor-pointer group animate-fade-in-up hover:bg-accent/50"
                                            style={{ animationDelay: `${index * 50}ms` }}
                                            onClick={() => navigate(`/training-flag/${flag.id}`)}
                                        >
                                            <div className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                                                <FlagIcon
                                                    className={`h-4 w-4 ${!flag.complete ? 'text-base-content/50' : 'text-success'}`}
                                                />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                {/* Call source - Name @ Company */}
                                                {(flag.prospectName ?? flag.prospectCompany) && (
                                                    <div className="text-xs font-semibold text-base-content/60 mb-0.5 truncate">
                                                        {flag.prospectName && flag.prospectCompany
                                                            ? `${flag.prospectName} @ ${flag.prospectCompany}`
                                                            : (flag.prospectName ?? flag.prospectCompany)}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors duration-200">
                                                        {getBriefFlagTitle(flag)}
                                                    </h4>
                                                </div>

                                                <div className="flex items-center gap-2 mt-1 text-xs text-base-content/70">
                                                    {flag.createdAt && (
                                                        <div className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {formatTimeAgo(flag.createdAt)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button className="btn btn-xs btn-ghost border border-base-300">
                                                    {!flag.complete ? 'Start' : 'Review'}
                                                </button>
                                                <ChevronRight className="h-4 w-4 text-base-content/50 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                                            </div>
                                        </div>
                                    );
                                })}
                                {currentFlags.length > 3 && (
                                    <button
                                        className="btn btn-ghost btn-sm w-full border border-base-300 hover:border-primary/30"
                                        onClick={() => navigate(`/salesperson/${salespersonId}`)}
                                    >
                                        View all {currentFlags.length} tasks
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
