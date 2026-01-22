import { $hoveringSales, type RepInfo } from '#data/dashboard';
import { tw } from '#util/tw';
import React from 'react';
import { useLocation } from 'wouter';
import clsx from 'clsx';
import { useStore } from '@nanostores/react';
import { Flag } from 'lucide-react';

const LeaderboardEntryLayout = tw.div`flex flex-row items-center gap-3 h-16 w-full hover:bg-base-200/70 p-3 rounded-lg transition-all duration-200 border border-base-content/20 hover:border-base-content/30 hover:shadow-sm`;
const StartLeaderboardEntryLayout = tw.div`min-h-30 flex flex-col items-center gap-1 w-fit max-w-[4in]`;
const Name = tw.p`text-sm font-semibold`;

export type LeaderboardEntryProps = RepInfo & { flags?: number; score: number; revenue: number; mtdRevenue: number; star?: boolean };

function _LeaderboardEntry({ star, navigate, ...rawprops }: LeaderboardEntryProps & { navigate: (to: string) => void; selected: boolean }) {
    const Layout = star ? StartLeaderboardEntryLayout : LeaderboardEntryLayout;
    const { firstName, lastName, id, ...props } = rawprops;

    const _graphics = star ? (
        <div className="w-4/5 flex flex-col">
            <progress className="progress h-2" value={props.score} max={100}></progress>
        </div>
    ) : null;

    const hover = (_e: React.MouseEvent<HTMLDivElement>) => {
        $hoveringSales.set(String(id));
    };

    const handleDoubleClick = (_e: React.MouseEvent<HTMLDivElement>) => {
        navigate(`/salesperson/${id}`);
    };

    const topClasses = clsx({
        'bg-base-300': props.selected,
        'cursor-pointer': true,
    });

    return (
        <Layout onClick={hover} onDoubleClick={handleDoubleClick} className={topClasses}>
            <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10">
                    <img className="w-full h-full rounded-full object-cover" src={props.avatar ?? ''} alt={`${firstName}'s avatar`} />
                </div>
                <Name>
                    {firstName} {lastName}
                </Name>
            </div>
            <div className="flex items-center gap-2 ml-auto">
                {(props.flags ?? 0) > 0 && (
                    <div className="badge badge-error p-1 gap-1">
                        {props.flags}
                        <Flag className="w-3 h-3" />
                    </div>
                )}
            </div>
        </Layout>
    );
}

export const LeaderboardEntry = React.memo(_LeaderboardEntry);

export function LeaderboardEntries(props: { entries: LeaderboardEntryProps[] }) {
    const [, navigate] = useLocation();

    const selected = useStore($hoveringSales);
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-base-content/30 p-4 bg-base-200 shadow-sm">
            {props.entries.map((entry) => (
                <LeaderboardEntry {...entry} navigate={navigate} key={entry.id} selected={selected === String(entry.id)} />
            ))}
        </div>
    );
}
