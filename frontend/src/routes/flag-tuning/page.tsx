import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ho } from '#data/client';
import { tw } from '#util/tw';
import { queryFlagData } from '#data/fetchers';
import { CallRecording } from '../dashboard/training/sections/CallRecording';
import { Transcript } from '../dashboard/training/sections/Transcript';
import { FlagAnalysis } from '../dashboard/training/sections/FlagAnalysis';
import { BetterResponse } from '../dashboard/training/sections/BetterResponse';
import { Flag, BookOpen, MessageSquare, Clock, User, Calendar, Eye, PenTool, X } from 'lucide-react';

// Styled components using tw
const Container = tw.div`space-y-6`;
const Header = tw.div`border-b border-base-content/20 pb-4`;
const HeaderTitle = tw.h1`text-3xl font-bold flex items-center gap-3`;
const HeaderDescription = tw.p`text-base-content/60 mt-1`;
const StatsContainer = tw.div`flex items-center gap-4 text-sm`;
const StatItem = tw.div`flex items-center gap-2`;
const StatDot = tw.div`w-2 h-2 rounded-full`;

const TabsContainer = tw.div`tabs tabs-boxed max-w-[500px]`;
const TabButton = tw.button`tab`;

const Card = tw.div`card bg-base-200 border border-base-content/30`;
const CardHeader = tw.div`p-4`;
const CardBody = tw.div`p-4 pt-0`;
const CardTitle = tw.h3`text-lg font-semibold`;
const CardGrid = tw.div`space-y-4`;

const Badge = tw.div`badge badge-sm gap-1`;
const Button = tw.button`btn btn-sm`;

const Dialog = tw.dialog`modal`;
const DialogBackdrop = tw.div`modal-backdrop bg-black/50`;
const DialogContent = tw.div`modal-box max-w-5xl bg-base-200 border border-base-content/30`;
const DialogHeader = tw.h3`font-bold text-lg mb-4 flex items-center gap-2`;
const DialogActions = tw.div`modal-action`;

const TextArea = tw.textarea`textarea textarea-bordered w-full min-h-[120px]`;
const Select = tw.select`select select-bordered w-full`;
const Label = tw.label`label`;
const LabelText = tw.span`label-text font-medium`;

const InfoBox = tw.div`bg-base-300/50 rounded-lg border border-base-content/20 p-4`;
const InfoTitle = tw.h4`font-medium text-sm mb-2`;
const InfoText = tw.p`text-sm`;

const Section = tw.div`card bg-base-300/50 border border-base-content/20`;

const REASON_LABELS: Record<string, string> = {
    'incorrect-flag': 'Incorrectly Flagged',
    'outdated-technique': 'Outdated Technique',
    'poor-scoring': 'Poor Scoring System',
    'wrong-context': 'Wrong Context',
    'technical-issue': 'Technical Issue',
    other: 'Other',
};

export function FlagTuningPage() {
    const [activeTab, setActiveTab] = useState<'weekly' | 'reports'>('weekly');
    const [selectedFlag, setSelectedFlag] = useState<any | null>(null);
    const [showCoachNotesDialog, setShowCoachNotesDialog] = useState(false);
    const [showResponseDialog, setShowResponseDialog] = useState(false);
    const [showFlagDetailsDialog, setShowFlagDetailsDialog] = useState(false);
    const [coachNotes, setCoachNotes] = useState('');
    const [managerAction, setManagerAction] = useState<'agree' | 'disagree'>('agree');
    const [responseText, setResponseText] = useState('');

    const queryClient = useQueryClient();

    // Fetch full flag data when flag details dialog is open
    const { data: fullFlagData, isLoading: flagDataLoading } = useQuery({
        ...queryFlagData(selectedFlag?.id?.toString() ?? ''),
        enabled: showFlagDetailsDialog && !!selectedFlag?.id,
    });

    // Extract data from the full flag response
    const flagData = fullFlagData?.flag;
    const relatedInteraction = fullFlagData?.interaction;
    const salespersonData = fullFlagData?.salesperson;
    const audioFile = fullFlagData?.audioFile;
    const transcriptData = relatedInteraction?.v1_raw_google_diarized ?? null;

    // Fetch weekly review flags
    const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
        queryKey: ['flags', 'weekly-reviews'],
        queryFn: async () => {
            const response = await ho.vantage.api.flags.manager['weekly-reviews'].$get();
            if (!response.ok) throw new Error('Failed to fetch weekly reviews');
            return response.json();
        },
    });

    // Fetch bad flag reports
    const { data: reportsData, isLoading: reportsLoading } = useQuery({
        queryKey: ['flags', 'bad-reports'],
        queryFn: async () => {
            const response = await ho.vantage.api.flags.manager['bad-reports'].$get();
            if (!response.ok) throw new Error('Failed to fetch bad reports');
            return response.json();
        },
    });

    // Submit coach notes mutation
    const coachNotesMutation = useMutation({
        mutationFn: async ({ flagId, notes }: { flagId: number; notes: string }) => {
            const response = await ho.vantage.api.flags[':flagId']['coach-notes'].$post({
                param: { flagId: flagId.toString() },
                json: { coachNotes: notes },
            });
            if (!response.ok) throw new Error('Failed to submit coach notes');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['flags', 'weekly-reviews'] });
            setShowCoachNotesDialog(false);
            setCoachNotes('');
            setSelectedFlag(null);
        },
    });

    // Respond to bad flag report mutation
    const respondMutation = useMutation({
        mutationFn: async ({ flagId, action, response }: { flagId: number; action: 'agree' | 'disagree'; response: string }) => {
            const responseData = await ho.vantage.api.flags[':flagId']['respond-report'].$post({
                param: { flagId: flagId.toString() },
                json: { action, response },
            });
            if (!responseData.ok) throw new Error('Failed to respond to report');
            return responseData.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['flags', 'bad-reports'] });
            setShowResponseDialog(false);
            setResponseText('');
            setManagerAction('agree');
            setSelectedFlag(null);
        },
    });

    const handleCoachNotesSubmit = () => {
        if (!selectedFlag || coachNotes.trim().length < 10) return;
        coachNotesMutation.mutate({ flagId: selectedFlag.id, notes: coachNotes });
    };

    const handleResponseSubmit = () => {
        if (!selectedFlag || responseText.trim().length < 10) return;
        respondMutation.mutate({
            flagId: selectedFlag.id,
            action: managerAction,
            response: responseText,
        });
    };

    const openFlagDetailsDialog = (flag: any) => {
        setSelectedFlag(flag);
        setShowFlagDetailsDialog(true);
    };

    const closeFlagDetailsDialog = () => {
        setShowFlagDetailsDialog(false);
        setSelectedFlag(null);
    };

    const openCoachNotesDialog = (flag: any) => {
        setSelectedFlag(flag);
        setCoachNotes(flag.weeklyReviewStatus?.coachNotes || '');
        setShowCoachNotesDialog(true);
    };

    const openResponseDialog = (flag: any) => {
        setSelectedFlag(flag);
        setResponseText('');
        setManagerAction('agree');
        setShowResponseDialog(true);
    };

    const weeklyFlags = weeklyData?.flags || [];
    const badReports = reportsData?.flags?.filter((f: any) => f.badFlagReport?.status === 'pending') || [];

    // Helper to get severity color class
    const getSeverityBorderClass = (severity?: string) => {
        switch (severity) {
            case 'high':
                return 'border-l-error';
            case 'medium':
                return 'border-l-warning';
            case 'low':
                return 'border-l-info';
            default:
                return 'border-l-primary';
        }
    };

    return (
        <Container>
            {/* Header */}
            <Header>
                <div className="flex items-center justify-between">
                    <div>
                        <HeaderTitle>
                            <Flag className="w-8 h-8" />
                            Flag Tuning
                        </HeaderTitle>
                        <HeaderDescription>Review and respond to flag reports from your team</HeaderDescription>
                    </div>
                    <StatsContainer>
                        <StatItem>
                            <StatDot className="bg-primary" />
                            <span>{weeklyFlags.length} Weekly Reviews</span>
                        </StatItem>
                        <StatItem>
                            <StatDot className="bg-warning" />
                            <span>{badReports.length} Reports</span>
                        </StatItem>
                    </StatsContainer>
                </div>
            </Header>

            {/* Tabs */}
            <TabsContainer className="tabs">
                <TabButton className={activeTab === 'weekly' ? 'tab tab-active' : 'tab'} onClick={() => setActiveTab('weekly')}>
                    <BookOpen className="w-4 h-4 mr-2" />
                    Weekly Reviews ({weeklyFlags.length})
                </TabButton>
                <TabButton className={activeTab === 'reports' ? 'tab tab-active' : 'tab'} onClick={() => setActiveTab('reports')}>
                    <Flag className="w-4 h-4 mr-2" />
                    Reported Bad Flags ({badReports.length})
                </TabButton>
            </TabsContainer>

            {/* Weekly Reviews Tab */}
            {activeTab === 'weekly' && (
                <div>
                    <InfoBox className="mb-4">
                        <div className="flex items-start gap-3">
                            <BookOpen className="w-5 h-5 mt-0.5 text-primary" />
                            <div>
                                <InfoTitle>Weekly Coach Notes</InfoTitle>
                                <InfoText className="text-base-content/60">
                                    Review these training scenarios and add your coaching insights. Your notes help improve our AI training
                                    and provide guidance for similar situations.
                                </InfoText>
                            </div>
                        </div>
                    </InfoBox>

                    {weeklyLoading ? (
                        <div className="flex justify-center py-12">
                            <span className="loading loading-spinner loading-lg" />
                        </div>
                    ) : weeklyFlags.length === 0 ? (
                        <Card>
                            <CardBody className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <Flag className="w-12 h-12 mx-auto text-base-content/40 mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No Weekly Reviews</h3>
                                    <p className="text-base-content/60">Check back later for flags to review</p>
                                </div>
                            </CardBody>
                        </Card>
                    ) : (
                        <CardGrid>
                            {weeklyFlags.map((flag: any) => (
                                <Card key={flag.id} className={`border-l-4 ${getSeverityBorderClass(flag.flagData?.severity)}`}>
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <CardTitle>{flag.flagData?.flag_title || 'Training Flag'}</CardTitle>
                                                    {flag.weeklyReviewStatus?.coachNotes && (
                                                        <Badge className="badge-success">
                                                            <PenTool className="w-3 h-3" />
                                                            Has Notes
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-base-content/60">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="w-4 h-4" />
                                                        {flag.prospectName || flag.flagData?.prospect_name || 'Unknown'} •{' '}
                                                        {flag.createdAt ? new Date(flag.createdAt).toLocaleDateString() : 'Unknown date'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button className="btn-outline" onClick={() => openFlagDetailsDialog(flag)}>
                                                    <Eye className="w-4 h-4 mr-1" />
                                                    View Flag
                                                </Button>
                                                <Button className="btn-primary" onClick={() => openCoachNotesDialog(flag)}>
                                                    <PenTool className="w-4 h-4 mr-1" />
                                                    {flag.weeklyReviewStatus?.coachNotes ? 'Edit Notes' : 'Add Notes'}
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardBody>
                                        {/* Situation Preview */}
                                        {flag.flagData?.what_happened && (
                                            <div className="mb-3">
                                                <h4 className="font-medium text-sm mb-2">Situation:</h4>
                                                <div className="bg-base-300/50 rounded p-3">
                                                    <p className="text-sm line-clamp-2">{flag.flagData.what_happened}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Rep Response Preview */}
                                        {flag.flagData?.rep_response && (
                                            <div className="mb-3">
                                                <h4 className="font-medium text-sm mb-2">Rep Response:</h4>
                                                <div className="bg-error/10 rounded p-3 border border-error/20">
                                                    <p className="text-sm italic line-clamp-2">"{flag.flagData.rep_response}"</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Coach Notes Preview */}
                                        {flag.weeklyReviewStatus?.coachNotes && (
                                            <div>
                                                <h4 className="font-medium text-sm mb-2">Your Coach Notes:</h4>
                                                <div className="bg-primary/5 rounded p-3 border border-primary/20">
                                                    <p className="text-sm line-clamp-3">{flag.weeklyReviewStatus.coachNotes}</p>
                                                </div>
                                            </div>
                                        )}
                                    </CardBody>
                                </Card>
                            ))}
                        </CardGrid>
                    )}
                </div>
            )}

            {/* Bad Reports Tab */}
            {activeTab === 'reports' && (
                <div>
                    {reportsLoading ? (
                        <div className="flex justify-center py-12">
                            <span className="loading loading-spinner loading-lg" />
                        </div>
                    ) : badReports.length === 0 ? (
                        <Card>
                            <CardBody className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <Flag className="w-12 h-12 mx-auto text-base-content/40 mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No Reported Bad Flags</h3>
                                    <p className="text-base-content/60">All bad flag reports have been reviewed.</p>
                                </div>
                            </CardBody>
                        </Card>
                    ) : (
                        <CardGrid>
                            {badReports.map((flag: any) => (
                                <Card key={flag.id} className="border-l-4 border-l-warning">
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <CardTitle>{flag.flagData?.flag_title || 'Training Flag'}</CardTitle>
                                                    <Badge className="badge-warning gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        Pending
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-base-content/60">
                                                    <div className="flex items-center gap-1">
                                                        <User className="w-4 h-4" />
                                                        Reported by User
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="w-4 h-4" />
                                                        {new Date(flag.badFlagReport.reportedAt).toLocaleDateString()}
                                                    </div>
                                                    <Badge className="badge-outline">{REASON_LABELS[flag.badFlagReport.reason]}</Badge>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button className="btn-outline" onClick={() => openFlagDetailsDialog(flag)}>
                                                    <Eye className="w-4 h-4 mr-1" />
                                                    View Flag
                                                </Button>
                                                <Button className="btn-primary" onClick={() => openResponseDialog(flag)}>
                                                    <MessageSquare className="w-4 h-4 mr-1" />
                                                    Respond
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardBody>
                                        <div className="bg-base-300/50 rounded p-3">
                                            <p className="text-sm">{flag.badFlagReport.details}</p>
                                        </div>
                                    </CardBody>
                                </Card>
                            ))}
                        </CardGrid>
                    )}
                </div>
            )}

            {/* Flag Details Dialog - Full Rep Experience */}
            {showFlagDetailsDialog && selectedFlag && (
                <Dialog className="modal modal-open">
                    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between mb-4">
                            <DialogHeader className="mb-0">
                                <Flag className="w-5 h-5" />
                                Training Flag Details
                            </DialogHeader>
                            <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={closeFlagDetailsDialog}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {flagDataLoading ? (
                            <div className="flex justify-center py-12">
                                <span className="loading loading-spinner loading-lg" />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Flag Header with Rep Info */}
                                <div className="border-b border-base-content/20 pb-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-4">
                                            {/* Rep Avatar */}
                                            {salespersonData?.salesperson && (
                                                <div className="flex items-center gap-3">
                                                    <div className="avatar">
                                                        <div className="w-12 h-12 rounded-full">
                                                            {salespersonData.salesperson.avatar ? (
                                                                <img
                                                                    src={salespersonData.salesperson.avatar}
                                                                    alt={`${salespersonData.salesperson.firstName} ${salespersonData.salesperson.lastName}`}
                                                                />
                                                            ) : (
                                                                <div className="bg-primary text-primary-content flex items-center justify-center w-full h-full text-lg font-semibold">
                                                                    {salespersonData.salesperson.firstName?.[0]}
                                                                    {salespersonData.salesperson.lastName?.[0]}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold">
                                                            {salespersonData.salesperson.firstName} {salespersonData.salesperson.lastName}
                                                        </p>
                                                        <p className="text-sm text-base-content/60">Sales Rep</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {(flagData?.flagData as any)?.severity && (
                                            <Badge
                                                className={
                                                    (flagData?.flagData as any)?.severity === 'high'
                                                        ? 'badge-error'
                                                        : (flagData?.flagData as any)?.severity === 'medium'
                                                          ? 'badge-warning'
                                                          : 'badge-info'
                                                }
                                            >
                                                {(flagData?.flagData as any)?.severity} severity
                                            </Badge>
                                        )}
                                    </div>
                                    <h3 className="text-xl font-semibold mb-2">
                                        {flagData?.flagData?.flag_title || selectedFlag.flagData?.flag_title || 'Training Flag'}
                                    </h3>
                                    <p className="text-base-content/60">
                                        {relatedInteraction?.metadata?.prospect?.name || selectedFlag.prospectName || 'Unknown Prospect'} •{' '}
                                        {flagData?.createdAt
                                            ? new Date(flagData.createdAt).toLocaleDateString()
                                            : selectedFlag.createdAt
                                              ? new Date(selectedFlag.createdAt).toLocaleDateString()
                                              : 'Unknown date'}
                                    </p>
                                </div>

                                {/* Call Recording - Same as Rep sees */}
                                <Section>
                                    <div className="card-body">
                                        <CallRecording audioFile={audioFile} flagData={flagData} />
                                    </div>
                                </Section>

                                {/* Transcript - Same as Rep sees */}
                                <Section>
                                    <div className="card-body">
                                        <Transcript
                                            relatedInteraction={relatedInteraction}
                                            transcriptData={transcriptData}
                                            flagData={flagData}
                                        />
                                    </div>
                                </Section>

                                {/* Analysis Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* What Happened / Flag Analysis */}
                                    <Section>
                                        <div className="card-body">
                                            <FlagAnalysis flagData={flagData || selectedFlag} />
                                        </div>
                                    </Section>

                                    {/* Why This Matters */}
                                    <Section className="border-l-4 border-l-primary">
                                        <div className="card-body">
                                            <h2 className="text-lg font-semibold mb-4">Why This Matters</h2>
                                            <p className="text-sm leading-relaxed text-base-content/80">
                                                {flagData?.flagData?.why_this_matters ||
                                                    selectedFlag.flagData?.why_this_matters ||
                                                    'No information available'}
                                            </p>
                                        </div>
                                    </Section>
                                </div>

                                {/* Better Responses - Full width */}
                                <Section>
                                    <div className="card-body">
                                        <BetterResponse flagData={flagData || selectedFlag} />
                                    </div>
                                </Section>

                                {/* Report Context (if bad flag report) */}
                                {selectedFlag.badFlagReport && (
                                    <div>
                                        <h4 className="font-semibold mb-3 text-error">Why this flag was reported as incorrect:</h4>
                                        <div className="card bg-error/10 border border-error/20">
                                            <div className="card-body p-4">
                                                <div className="flex items-center gap-4 mb-2 text-sm">
                                                    <span>
                                                        <strong>Reason:</strong> {REASON_LABELS[selectedFlag.badFlagReport.reason]}
                                                    </span>
                                                </div>
                                                <p className="text-sm">{selectedFlag.badFlagReport.details}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <DialogActions>
                            <Button className="btn-ghost" onClick={closeFlagDetailsDialog}>
                                Close
                            </Button>
                            {selectedFlag.badFlagReport ? (
                                <Button
                                    className="btn-primary"
                                    onClick={() => {
                                        closeFlagDetailsDialog();
                                        openResponseDialog(selectedFlag);
                                    }}
                                >
                                    <MessageSquare className="w-4 h-4 mr-1" />
                                    Respond to Report
                                </Button>
                            ) : (
                                <Button
                                    className="btn-primary"
                                    onClick={() => {
                                        closeFlagDetailsDialog();
                                        openCoachNotesDialog(selectedFlag);
                                    }}
                                >
                                    <PenTool className="w-4 h-4 mr-1" />
                                    {selectedFlag.weeklyReviewStatus?.coachNotes ? 'Edit Notes' : 'Add Notes'}
                                </Button>
                            )}
                        </DialogActions>
                    </DialogContent>
                    <DialogBackdrop onClick={closeFlagDetailsDialog} />
                </Dialog>
            )}

            {/* Coach Notes Dialog */}
            {showCoachNotesDialog && (
                <Dialog className="modal modal-open">
                    <DialogContent>
                        <DialogHeader>
                            <PenTool className="w-5 h-5" />
                            {selectedFlag?.weeklyReviewStatus?.coachNotes ? 'Edit' : 'Add'} Coach Notes
                        </DialogHeader>

                        {selectedFlag && (
                            <div className="space-y-4">
                                {/* Scenario Overview */}
                                <div className="bg-base-300/50 rounded-lg p-4 border border-base-content/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-sm text-base-content/60">
                                            {selectedFlag.prospectName || selectedFlag.flagData?.prospect_name || 'Unknown'} •{' '}
                                            {selectedFlag.createdAt
                                                ? new Date(selectedFlag.createdAt).toLocaleDateString()
                                                : 'Unknown date'}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        {selectedFlag.flagData?.what_happened && (
                                            <div>
                                                <h4 className="font-medium text-sm mb-1">Situation:</h4>
                                                <p className="text-sm bg-base-200 rounded p-2 border border-base-content/10">
                                                    {selectedFlag.flagData.what_happened}
                                                </p>
                                            </div>
                                        )}
                                        {(selectedFlag.flagData?.rep_response || selectedFlag.flagData?.rep_line) && (
                                            <div>
                                                <h4 className="font-medium text-sm mb-1">Rep Response:</h4>
                                                <div className="bg-error/10 rounded p-2 border border-error/20">
                                                    <p className="text-sm italic">
                                                        "{selectedFlag.flagData.rep_response || selectedFlag.flagData.rep_line}"
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Coach Notes Input */}
                                <div className="space-y-2">
                                    <Label>
                                        <LabelText>Your Coaching Notes</LabelText>
                                    </Label>
                                    <p className="text-xs text-base-content/60 mb-2">
                                        How would you coach this situation? What should the rep have done differently? What questions should
                                        they have asked?
                                    </p>
                                    <TextArea
                                        value={coachNotes}
                                        onChange={(e) => setCoachNotes(e.target.value)}
                                        placeholder="Example: Great teachable moment here. When prospects mention budget concerns, we need to dig deeper into the root cause. The rep should have asked clarifying questions like 'Help me understand - is this a timing issue or is the investment amount the concern?' This approach creates dialogue instead of ending the conversation..."
                                        className={coachNotes.trim().length > 0 && coachNotes.trim().length < 10 ? 'textarea-error' : ''}
                                    />
                                    {coachNotes.trim().length > 0 && coachNotes.trim().length < 10 && (
                                        <p className="text-xs text-error">Need at least {10 - coachNotes.trim().length} more characters</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <DialogActions>
                            <Button className="btn-ghost" onClick={() => setShowCoachNotesDialog(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="btn-primary"
                                onClick={handleCoachNotesSubmit}
                                disabled={coachNotesMutation.isPending || coachNotes.trim().length < 10}
                            >
                                {coachNotesMutation.isPending ? 'Saving...' : 'Save Coach Notes'}
                            </Button>
                        </DialogActions>
                    </DialogContent>
                    <DialogBackdrop onClick={() => setShowCoachNotesDialog(false)} />
                </Dialog>
            )}

            {/* Response Dialog */}
            {showResponseDialog && (
                <Dialog className="modal modal-open">
                    <DialogContent>
                        <DialogHeader>
                            <MessageSquare className="w-5 h-5" />
                            Respond to Bad Flag Report
                        </DialogHeader>

                        {selectedFlag?.badFlagReport && (
                            <div className="space-y-4">
                                <div className="bg-base-300/50 rounded p-4 border border-base-content/20">
                                    <div className="flex items-center gap-4 mb-2 text-sm">
                                        <span>
                                            <strong>Reason:</strong> {REASON_LABELS[selectedFlag.badFlagReport.reason]}
                                        </span>
                                    </div>
                                    <p className="text-sm">{selectedFlag.badFlagReport.details}</p>
                                </div>

                                <div>
                                    <Label>
                                        <LabelText>Your decision</LabelText>
                                    </Label>
                                    <Select
                                        value={managerAction}
                                        onChange={(e) => setManagerAction(e.target.value as 'agree' | 'disagree')}
                                    >
                                        <option value="agree">Agree - Flag was incorrectly identified</option>
                                        <option value="disagree">Disagree - Send back to rep with feedback</option>
                                    </Select>
                                </div>

                                <div>
                                    <Label>
                                        <LabelText>
                                            {managerAction === 'agree' ? 'Additional context (optional)' : 'Feedback for the rep'}
                                        </LabelText>
                                    </Label>
                                    <TextArea
                                        value={responseText}
                                        onChange={(e) => setResponseText(e.target.value)}
                                        placeholder={
                                            managerAction === 'agree'
                                                ? "Add any additional context about why this flag was incorrect and how we'll improve..."
                                                : 'Explain why you disagree and provide guidance to the rep...'
                                        }
                                        className={
                                            responseText.trim().length > 0 && responseText.trim().length < 10 ? 'textarea-error' : ''
                                        }
                                    />
                                    {responseText.trim().length > 0 && responseText.trim().length < 10 && (
                                        <p className="text-xs text-error">
                                            Need at least {10 - responseText.trim().length} more characters
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        <DialogActions>
                            <Button className="btn-ghost" onClick={() => setShowResponseDialog(false)}>
                                Cancel
                            </Button>
                            <Button
                                className={managerAction === 'agree' ? 'btn-success' : 'btn-error'}
                                onClick={handleResponseSubmit}
                                disabled={respondMutation.isPending || responseText.trim().length < 10}
                            >
                                {respondMutation.isPending ? 'Submitting...' : 'Submit Response'}
                            </Button>
                        </DialogActions>
                    </DialogContent>
                    <DialogBackdrop onClick={() => setShowResponseDialog(false)} />
                </Dialog>
            )}
        </Container>
    );
}
