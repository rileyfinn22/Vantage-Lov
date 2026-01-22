import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from '#data/client';
import { Star, AlertTriangle, Flag } from 'lucide-react';
import { tw } from '#util/tw';

interface FlagRatingProps {
    flagId: number;
    currentRating?: number | null;
    hasReport?: boolean;
}

const Title = tw.h4`font-semibold text-sm mb-3`;
const RatingContainer = tw.div`flex items-center gap-2`;
const StarButton = tw.button`btn btn-ghost btn-sm p-1 transition-all hover:scale-110`;
const FeedbackText = tw.p`text-xs text-base-content/60 mt-2`;
const Button = tw.button`btn btn-sm`;
const Select = tw.select`select select-bordered w-full select-sm`;
const TextArea = tw.textarea`textarea textarea-bordered w-full`;
const Label = tw.label`label`;
const LabelText = tw.span`label-text text-xs`;
const Alert = tw.div`alert alert-warning mt-2`;
const SuccessAlert = tw.div`alert alert-success`;

type ReportReason = 'incorrect-flag' | 'outdated-technique' | 'poor-scoring' | 'wrong-context' | 'technical-issue' | 'other';

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
    { value: 'incorrect-flag', label: 'Incorrectly Flagged' },
    { value: 'outdated-technique', label: 'Outdated Technique' },
    { value: 'poor-scoring', label: 'Poor Scoring System' },
    { value: 'wrong-context', label: 'Wrong Context' },
    { value: 'technical-issue', label: 'Technical Issue' },
    { value: 'other', label: 'Other' },
];

export function FlagRating({ flagId, currentRating, hasReport }: FlagRatingProps) {
    const [hoveredRating, setHoveredRating] = useState<number | null>(null);
    const [showReportForm, setShowReportForm] = useState(false);
    const [reason, setReason] = useState<ReportReason>('incorrect-flag');
    const [details, setDetails] = useState('');
    const queryClient = useQueryClient();

    const rateMutation = useMutation({
        mutationFn: async (rating: number) => {
            const response = await ho.vantage.api.flags[':flagId'].rate.$post({
                param: { flagId: flagId.toString() },
                json: { rating },
            });
            if (!response.ok) throw new Error('Failed to rate flag');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['flag', flagId] });
            queryClient.invalidateQueries({ queryKey: ['flags'] });
        },
    });

    const reportMutation = useMutation({
        mutationFn: async () => {
            const response = await ho.vantage.api.flags[':flagId']['report-bad'].$post({
                param: { flagId: flagId.toString() },
                json: { reason, details },
            });
            if (!response.ok) throw new Error('Failed to report flag');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['flag', flagId] });
            queryClient.invalidateQueries({ queryKey: ['flags'] });
            setShowReportForm(false);
            setDetails('');
        },
    });

    const handleRate = (rating: number) => {
        rateMutation.mutate(rating);
    };

    const handleReportSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (details.trim().length < 10) {
            return;
        }
        reportMutation.mutate();
    };

    const displayRating = hoveredRating ?? currentRating ?? 0;

    // If showing the report form, show that instead
    if (showReportForm) {
        return (
            <form onSubmit={handleReportSubmit} className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <Title>Report Flag Issue</Title>
                    <Button type="button" className="btn-ghost btn-xs" onClick={() => setShowReportForm(false)}>
                        Cancel
                    </Button>
                </div>

                <div className="form-control">
                    <Label>
                        <LabelText>What's the issue?</LabelText>
                    </Label>
                    <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
                        {REASON_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="form-control">
                    <Label>
                        <LabelText>Please explain (minimum 10 characters)</LabelText>
                    </Label>
                    <TextArea
                        rows={4}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Explain why this flag is incorrect or needs review..."
                        className={details.trim().length > 0 && details.trim().length < 10 ? 'textarea-error' : ''}
                    />
                    {details.trim().length > 0 && details.trim().length < 10 && (
                        <label className="label">
                            <span className="label-text-alt text-error">Need at least {10 - details.trim().length} more characters</span>
                        </label>
                    )}
                </div>

                {reportMutation.isError && (
                    <Alert>
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm">Failed to submit report. Please try again.</span>
                    </Alert>
                )}

                <div className="flex gap-2 justify-end">
                    <Button type="button" className="btn-ghost" onClick={() => setShowReportForm(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" className="btn-warning" disabled={reportMutation.isPending || details.trim().length < 10}>
                        {reportMutation.isPending ? 'Submitting...' : 'Submit Report'}
                    </Button>
                </div>
            </form>
        );
    }

    return (
        <div className="space-y-4">
            {/* Rating Section */}
            <div>
                <Title>How helpful was this feedback?</Title>
                <RatingContainer onMouseLeave={() => setHoveredRating(null)}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                        <StarButton
                            key={rating}
                            onClick={() => handleRate(rating)}
                            onMouseEnter={() => setHoveredRating(rating)}
                            disabled={rateMutation.isPending}
                            className={rating <= displayRating ? 'text-warning' : 'text-base-content/20'}
                        >
                            <Star size={20} fill={rating <= displayRating ? 'currentColor' : 'none'} />
                        </StarButton>
                    ))}
                </RatingContainer>
                {currentRating && <FeedbackText>You rated this {currentRating}/10</FeedbackText>}
                {rateMutation.isPending && <FeedbackText>Saving your rating...</FeedbackText>}
            </div>

            {/* Divider */}
            <div className="divider my-2"></div>

            {/* Report Issue Section */}
            {hasReport ? (
                <SuccessAlert>
                    <Flag className="w-4 h-4" />
                    <span className="text-sm">You've reported this flag. A manager will review it soon.</span>
                </SuccessAlert>
            ) : (
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium">Something wrong with this flag?</p>
                        <p className="text-xs text-base-content/60">Report it to your manager for review</p>
                    </div>
                    <Button className="btn-warning btn-outline gap-2" onClick={() => setShowReportForm(true)}>
                        <AlertTriangle className="w-4 h-4" />
                        Report Issue
                    </Button>
                </div>
            )}
        </div>
    );
}
