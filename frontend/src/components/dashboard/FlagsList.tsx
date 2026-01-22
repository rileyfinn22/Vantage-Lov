import { tw } from '#util/tw';
import { FlagListItem } from './FlagListItem';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Styled Components using DaisyUI
const FlagsHeader = tw.div`flex justify-between items-center mb-3`;
const FlagsTitle = tw.h3`font-medium text-sm`;
const FlagsCount = tw.span`text-xs font-medium`;
const FlagsListContainer = tw.div`grid grid-cols-1 gap-2`;
const PaginationContainer = tw.div`flex justify-center items-center gap-2 pt-4`;

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

interface PaginationInfo {
    page: number;
    totalPages: number;
    total: number;
}

interface FlagsListProps {
    flags: TrainingFlag[];
    onFlagClick?: (flagId: number) => void;
    pagination?: PaginationInfo;
    onPreviousPage?: () => void;
    onNextPage?: () => void;
    isLoadingPage?: boolean;
}

/**
 * Container component for displaying a list of training flags
 * Includes header with title and incomplete count, flag items, and pagination controls
 */
export function FlagsList({ flags, onFlagClick, pagination, onPreviousPage, onNextPage, isLoadingPage }: FlagsListProps) {
    const incompleteFlags = flags.filter((flag) => !flag.complete);

    // Empty state
    if (flags.length === 0) {
        return (
            <div>
                <FlagsHeader>
                    <FlagsTitle>Training Flags</FlagsTitle>
                    <FlagsCount className="text-success">0 not complete</FlagsCount>
                </FlagsHeader>
                <p className="text-base-content/60">No flags</p>
            </div>
        );
    }

    return (
        <div>
            {/* Header with title and incomplete count */}
            <FlagsHeader>
                <FlagsTitle>Training Flags</FlagsTitle>
                <FlagsCount className={incompleteFlags.length > 0 ? 'text-error' : 'text-success'}>
                    {incompleteFlags.length} not complete
                </FlagsCount>
            </FlagsHeader>

            {/* List of flags */}
            <FlagsListContainer>
                {flags.map((flag) => (
                    <FlagListItem key={flag.id} flag={flag} onClick={onFlagClick} />
                ))}
            </FlagsListContainer>

            {/* Pagination controls */}
            {pagination && (
                <PaginationContainer>
                    <div className="join">
                        <button className="join-item btn btn-sm" onClick={onPreviousPage} disabled={pagination.page <= 1 || isLoadingPage}>
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                        </button>
                        <div className="join-item btn btn-sm btn-ghost no-animation cursor-default">
                            Page {pagination.page} of {pagination.totalPages}
                        </div>
                        <button
                            className="join-item btn btn-sm"
                            onClick={onNextPage}
                            disabled={pagination.page >= pagination.totalPages || isLoadingPage}
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    {isLoadingPage && <span className="loading loading-spinner loading-sm ml-2"></span>}
                </PaginationContainer>
            )}
        </div>
    );
}
