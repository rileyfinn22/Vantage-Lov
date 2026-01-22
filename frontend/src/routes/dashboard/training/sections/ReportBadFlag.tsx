import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from '#data/client';
import { Flag, AlertTriangle } from 'lucide-react';
import { tw } from '#util/tw';

interface ReportBadFlagProps {
    flagId: number;
    hasReport?: boolean;
}

const Container = tw.div`bg-base-200 rounded-lg border border-base-content/30 p-4`;
const Title = tw.h4`font-semibold text-sm mb-3`;
const Button = tw.button`btn btn-sm`;
const Select = tw.select`select select-bordered w-full select-sm`;
const TextArea = tw.textarea`textarea textarea-bordered w-full`;
const Label = tw.label`label`;
const LabelText = tw.span`label-text text-xs`;
const Alert = tw.div`alert alert-warning mt-2`;
const SuccessAlert = tw.div`alert alert-success mt-2`;

type ReportReason = 'incorrect-flag' | 'outdated-technique' | 'poor-scoring' | 'wrong-context' | 'technical-issue' | 'other';

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
    { value: 'incorrect-flag', label: 'Incorrectly Flagged' },
    { value: 'outdated-technique', label: 'Outdated Technique' },
    { value: 'poor-scoring', label: 'Poor Scoring System' },
    { value: 'wrong-context', label: 'Wrong Context' },
    { value: 'technical-issue', label: 'Technical Issue' },
    { value: 'other', label: 'Other' },
];

export function ReportBadFlag({ flagId, hasReport }: ReportBadFlagProps) {
    const [showForm, setShowForm] = useState(false);
    const [reason, setReason] = useState<ReportReason>('incorrect-flag');
    const [details, setDetails] = useState('');
    const queryClient = useQueryClient();

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
            setShowForm(false);
            setDetails('');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (details.trim().length < 10) {
            return;
        }
        reportMutation.mutate();
    };

    if (hasReport) {
        return (
            <Container>
                <SuccessAlert>
                    <Flag className="w-4 h-4" />
                    <span className="text-sm">You've reported this flag. A manager will review it soon.</span>
                </SuccessAlert>
            </Container>
        );
    }

    if (!showForm) {
        return (
            <Container>
                <div className="flex items-center justify-between">
                    <div>
                        <Title>Something wrong with this flag?</Title>
                        <p className="text-xs text-base-content/60">Report it to your manager for review</p>
                    </div>
                    <Button className="btn-warning gap-2" onClick={() => setShowForm(true)}>
                        <AlertTriangle className="w-4 h-4" />
                        Report Issue
                    </Button>
                </div>
            </Container>
        );
    }

    return (
        <Container>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <Title>Report Flag Issue</Title>
                    <Button type="button" className="btn-ghost btn-xs" onClick={() => setShowForm(false)}>
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
                    <Button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" className="btn-warning" disabled={reportMutation.isPending || details.trim().length < 10}>
                        {reportMutation.isPending ? 'Submitting...' : 'Submit Report'}
                    </Button>
                </div>
            </form>
        </Container>
    );
}
