import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ho } from '#data/client';
import { tw } from '#util/tw';
import { FlaskConical, Play, Clock, ChevronDown, ChevronUp, FileText, AlertCircle, CheckCircle } from 'lucide-react';

const Container = tw.div`space-y-6 p-6`;
const Header = tw.div`border-b border-base-content/20 pb-4`;
const HeaderTitle = tw.h1`text-3xl font-bold flex items-center gap-3`;
const HeaderDescription = tw.p`text-base-content/60 mt-1`;

const Card = tw.div`card bg-base-200 border border-base-content/30`;
const CardBody = tw.div`card-body`;
const CardTitle = tw.h3`card-title text-lg`;

const TabsContainer = tw.div`tabs tabs-boxed`;
const TabButton = tw.button`tab`;

const TextArea = tw.textarea`textarea textarea-bordered w-full font-mono text-sm`;
const Label = tw.label`label`;
const LabelText = tw.span`label-text font-medium`;

const Badge = tw.span`badge`;
const Button = tw.button`btn`;

const CollapsibleHeader = tw.div`flex items-center justify-between cursor-pointer p-4 hover:bg-base-300/50 rounded-lg`;

type TabType = 'rating' | 'flagging' | 'extraction' | 'persona';

export function PromptWorkbenchPage() {
    const [transcript, setTranscript] = useState('');
    const [companyContext, setCompanyContext] = useState('');
    const [activeTab, setActiveTab] = useState<TabType>('rating');
    const [showPromptOverrides, setShowPromptOverrides] = useState(false);
    const [promptOverrides, setPromptOverrides] = useState<Record<TabType, string>>({
        rating: '',
        flagging: '',
        extraction: '',
        persona: '',
    });

    // Fetch default prompts
    const { data: defaultPrompts, isLoading: promptsLoading } = useQuery({
        queryKey: ['testing', 'prompts'],
        queryFn: async () => {
            const response = await ho.vantage.api.testing.prompts.$get();
            if (!response.ok) throw new Error('Failed to fetch prompts');
            return response.json();
        },
    });

    // Analysis mutation
    const analyzeMutation = useMutation({
        mutationFn: async () => {
            const overrides: Record<string, string> = {};
            if (promptOverrides.rating) overrides.rating = promptOverrides.rating;
            if (promptOverrides.flagging) overrides.flagging = promptOverrides.flagging;
            if (promptOverrides.extraction) overrides.extraction = promptOverrides.extraction;
            if (promptOverrides.persona) overrides.persona = promptOverrides.persona;

            const response = await ho.vantage.api.testing['analyze-transcript'].$post({
                json: {
                    transcript,
                    companyContext: companyContext || undefined,
                    promptOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
                },
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error((error as any)?.message ?? 'Analysis failed');
            }
            return response.json();
        },
    });

    const result = analyzeMutation.data?.result;
    const timing = analyzeMutation.data?.timing;

    const getResultForTab = (tab: TabType) => {
        if (!result) return null;
        switch (tab) {
            case 'rating':
                return result.rating;
            case 'flagging':
                return result.flagging;
            case 'extraction':
                return result.extraction;
            case 'persona':
                return result.personaWithRoleplay;
        }
    };

    const handleRunAnalysis = () => {
        if (transcript.length < 50) return;
        analyzeMutation.mutate();
    };

    const tabs: { key: TabType; label: string }[] = [
        { key: 'rating', label: 'Rating' },
        { key: 'flagging', label: 'Flags' },
        { key: 'extraction', label: 'Extraction' },
        { key: 'persona', label: 'Persona' },
    ];

    return (
        <Container>
            {/* Header */}
            <Header>
                <HeaderTitle>
                    <FlaskConical className="w-8 h-8 text-primary" />
                    Prompt Workbench
                </HeaderTitle>
                <HeaderDescription>
                    Test and iterate on analysis prompts. Paste a transcript, run analysis, and see the results in real-time.
                </HeaderDescription>
            </Header>

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Input */}
                <div className="space-y-4">
                    {/* Transcript Input */}
                    <Card>
                        <CardBody>
                            <CardTitle>
                                <FileText className="w-5 h-5" />
                                Transcript
                            </CardTitle>
                            <TextArea
                                placeholder="Paste your call transcript here...

Example format:
Rep: Hello, thank you for taking my call today.
Prospect: Hi, yes I have a few minutes.
Rep: Great! I wanted to discuss..."
                                className="min-h-[300px]"
                                value={transcript}
                                onChange={(e) => setTranscript(e.target.value)}
                            />
                            <div className="flex justify-between items-center mt-2 text-sm text-base-content/60">
                                <span>{transcript.length} characters</span>
                                {transcript.length < 50 && transcript.length > 0 && (
                                    <span className="text-warning">Minimum 50 characters required</span>
                                )}
                            </div>
                        </CardBody>
                    </Card>

                    {/* Company Context (Optional) */}
                    <Card>
                        <CardBody>
                            <CardTitle>Company Context (Optional)</CardTitle>
                            <TextArea
                                placeholder="Add company-specific context for more accurate analysis..."
                                className="min-h-[100px]"
                                value={companyContext}
                                onChange={(e) => setCompanyContext(e.target.value)}
                            />
                        </CardBody>
                    </Card>

                    {/* Prompt Overrides (Collapsible) */}
                    <Card>
                        <CollapsibleHeader onClick={() => setShowPromptOverrides(!showPromptOverrides)}>
                            <CardTitle className="m-0">
                                Prompt Overrides
                                <Badge className="badge-ghost ml-2">Advanced</Badge>
                            </CardTitle>
                            {showPromptOverrides ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </CollapsibleHeader>
                        {showPromptOverrides && (
                            <CardBody className="pt-0">
                                <div className="space-y-4">
                                    {tabs.map((tab) => (
                                        <div key={tab.key}>
                                            <Label>
                                                <LabelText>
                                                    {tab.label} Prompt
                                                    {promptOverrides[tab.key] && (
                                                        <Badge className="badge-primary badge-sm ml-2">Modified</Badge>
                                                    )}
                                                </LabelText>
                                            </Label>
                                            <TextArea
                                                placeholder={
                                                    promptsLoading
                                                        ? 'Loading default prompt...'
                                                        : `Leave empty to use default ${tab.label.toLowerCase()} prompt`
                                                }
                                                className="min-h-[150px]"
                                                value={promptOverrides[tab.key]}
                                                onChange={(e) =>
                                                    setPromptOverrides((prev) => ({
                                                        ...prev,
                                                        [tab.key]: e.target.value,
                                                    }))
                                                }
                                            />
                                            {defaultPrompts && !promptOverrides[tab.key] && (
                                                <button
                                                    className="btn btn-ghost btn-xs mt-1"
                                                    onClick={() =>
                                                        setPromptOverrides((prev) => ({
                                                            ...prev,
                                                            [tab.key]: (defaultPrompts as any)[tab.key] ?? '',
                                                        }))
                                                    }
                                                >
                                                    Load default to edit
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardBody>
                        )}
                    </Card>

                    {/* Run Button */}
                    <Button
                        className="btn-primary btn-lg w-full"
                        onClick={handleRunAnalysis}
                        disabled={transcript.length < 50 || analyzeMutation.isPending}
                    >
                        {analyzeMutation.isPending ? (
                            <>
                                <span className="loading loading-spinner loading-sm" />
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5" />
                                Run Analysis
                            </>
                        )}
                    </Button>
                </div>

                {/* Right: Output */}
                <div className="space-y-4">
                    {/* Stats */}
                    {timing && (
                        <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                <span>Completed in {timing.totalSeconds}s</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-success" />
                                <span>Analysis complete</span>
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {analyzeMutation.isError && (
                        <div className="alert alert-error">
                            <AlertCircle className="w-5 h-5" />
                            <span>{analyzeMutation.error?.message ?? 'Analysis failed'}</span>
                        </div>
                    )}

                    {/* Tabs */}
                    <TabsContainer>
                        {tabs.map((tab) => (
                            <TabButton
                                key={tab.key}
                                className={activeTab === tab.key ? 'tab-active' : ''}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                {tab.label}
                                {result && getResultForTab(tab.key) && (
                                    <span className="ml-1 w-2 h-2 rounded-full bg-success inline-block" />
                                )}
                            </TabButton>
                        ))}
                    </TabsContainer>

                    {/* Output Card */}
                    <Card className="min-h-[500px]">
                        <CardBody>
                            <CardTitle>{tabs.find((t) => t.key === activeTab)?.label} Output</CardTitle>
                            {!result && !analyzeMutation.isPending && (
                                <div className="flex flex-col items-center justify-center h-[400px] text-base-content/50">
                                    <FlaskConical className="w-16 h-16 mb-4 opacity-30" />
                                    <p className="text-lg">No results yet</p>
                                    <p className="text-sm">Paste a transcript and click "Run Analysis"</p>
                                </div>
                            )}
                            {analyzeMutation.isPending && (
                                <div className="flex flex-col items-center justify-center h-[400px]">
                                    <span className="loading loading-spinner loading-lg text-primary" />
                                    <p className="mt-4 text-base-content/70">Running {activeTab} analysis...</p>
                                </div>
                            )}
                            {result && (
                                <div className="bg-base-300 rounded-lg p-4 overflow-auto max-h-[600px]">
                                    <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                                        {JSON.stringify(getResultForTab(activeTab), null, 2) ?? 'No data'}
                                    </pre>
                                </div>
                            )}
                        </CardBody>
                    </Card>
                </div>
            </div>
        </Container>
    );
}
