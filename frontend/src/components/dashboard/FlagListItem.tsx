import { tw } from '#util/tw';
import { getBriefFlagTitle, formatTimeAgo } from '#util';
import { useLocation } from 'wouter';

// Styled Components using DaisyUI
const FlagItem = tw.div`
    p-2 border border-base-content/30 rounded bg-base-200
    hover:bg-base-300 transition-colors
    cursor-pointer
`;
const FlagContent = tw.div`space-y-1`;
const Badge = tw.span`px-2 py-1 text-xs font-medium rounded`;
const FlagName = tw.div`font-medium text-xs`;
const FlagMeta = tw.div`text-xs text-base-content/70`;

/**
 * Type representing a training flag
 */
type TrainingFlag = {
    id: number;
    complete: boolean;
    source?: string;
    createdAt: string | null;
    flagData?: {
        flag_title?: string;
    } | null;
    reason?: string | null;
    prospectName?: string | null;
    prospectCompany?: string | null;
};

interface FlagListItemProps {
    flag: TrainingFlag;
    onClick?: (flagId: number) => void;
}

/**
 * Presentational component for a single training flag item
 * Displays status badge, flag title, and time
 * Supports single-click (onClick callback) and double-click (navigate to flag detail)
 */
export function FlagListItem({ flag, onClick }: FlagListItemProps) {
    const [, navigate] = useLocation();

    const handleClick = () => {
        if (onClick) {
            onClick(flag.id);
        }
    };

    const handleDoubleClick = () => {
        navigate(`/training-flag/${flag.id}`);
    };

    // Build call source display: "Name @ Company" or just one if other missing
    const callSource =
        flag.prospectName && flag.prospectCompany
            ? `${flag.prospectName} @ ${flag.prospectCompany}`
            : (flag.prospectName ?? flag.prospectCompany);

    return (
        <FlagItem onClick={handleClick} onDoubleClick={handleDoubleClick}>
            <FlagContent>
                {/* Call Source - Name @ Company */}
                {callSource && <div className="text-xs font-semibold text-base-content/60 truncate">{callSource}</div>}

                {/* Flag Title (4 words max) */}
                <FlagName>{getBriefFlagTitle(flag)}</FlagName>

                {/* Time Ago */}
                {flag.createdAt && <FlagMeta>{formatTimeAgo(flag.createdAt)}</FlagMeta>}
            </FlagContent>
        </FlagItem>
    );
}
