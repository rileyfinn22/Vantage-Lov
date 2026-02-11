import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Loader2, Send, Mic, RefreshCw, Building2, Target, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useMeetingPrep, useGeneratePrepGuide, useStartPrepRoleplay, type MeetingPrep } from '#data/meetingPrep';
import { PrepRoleplay } from './PrepRoleplay';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

const callTypeLabels: Record<MeetingPrep['callType'], string> = {
    discovery: 'Discovery',
    demo: 'Demo',
    negotiation: 'Negotiation',
    closing: 'Closing',
    follow_up: 'Follow-up',
};

function PrepGuide({ guide, isLoading, onRegenerate }: { guide: string | null; isLoading: boolean; onRegenerate: () => void }) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="text-base-content/70">Generating your prep guide...</p>
                <p className="text-sm text-base-content/50 mt-1">This may take a moment</p>
            </div>
        );
    }

    if (!guide) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-12">
                <p className="text-base-content/70 mb-4">No prep guide generated yet</p>
                <button className="btn btn-primary" onClick={onRegenerate}>
                    Generate Prep Guide
                </button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-end mb-2">
                <button className="btn btn-ghost btn-xs gap-1" onClick={onRegenerate} title="Regenerate guide">
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                </button>
            </div>
            <div className="prose prose-sm max-w-none prose-headings:text-base-content prose-p:text-base-content/90 prose-li:text-base-content/90 prose-strong:text-base-content prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
                <ReactMarkdown>{guide}</ReactMarkdown>
            </div>
        </div>
    );
}

function PrepChat({
    prepId,
    chatHistory,
    onNewMessage,
}: {
    prepId: number;
    chatHistory: ChatMessage[];
    onNewMessage: (msg: ChatMessage) => void;
}) {
    const [message, setMessage] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom helper
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll should trigger on content changes
    useEffect(() => {
        scrollToBottom();
    }, [chatHistory.length, streamingContent]);

    const handleSend = async () => {
        if (!message.trim() || isStreaming) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: message.trim(),
            timestamp: new Date().toISOString(),
        };
        onNewMessage(userMessage);
        setMessage('');
        setIsStreaming(true);
        setStreamingContent('');

        try {
            const response = await fetch(`/vantage/api/meeting-prep/${prepId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message: userMessage.content }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value);
                    // Parse SSE events
                    const lines = text.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.chunk) {
                                    fullContent += data.chunk;
                                    setStreamingContent(fullContent);
                                }
                                if (data.done) {
                                    // Add the complete message to history
                                    onNewMessage({
                                        role: 'assistant',
                                        content: fullContent,
                                        timestamp: new Date().toISOString(),
                                    });
                                }
                            } catch {
                                // Skip invalid JSON
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
        } finally {
            setIsStreaming(false);
            setStreamingContent('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.length === 0 && !streamingContent && (
                    <div className="text-center text-base-content/50 py-8">
                        <p>Ask questions about your upcoming meeting</p>
                        <p className="text-sm mt-1">e.g., "What if they ask about pricing?"</p>
                    </div>
                )}

                {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}>
                        <div
                            className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-primary' : 'bg-base-200 text-base-content'}`}
                        >
                            {msg.role === 'assistant' ? (
                                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-headings:text-base-content prose-p:text-base-content/90 prose-li:text-base-content/90">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                            ) : (
                                msg.content
                            )}
                        </div>
                    </div>
                ))}

                {isStreaming && streamingContent && (
                    <div className="chat chat-start">
                        <div className="chat-bubble bg-base-200 text-base-content">
                            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-headings:text-base-content prose-p:text-base-content/90 prose-li:text-base-content/90">
                                <ReactMarkdown>{streamingContent}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                )}

                {isStreaming && !streamingContent && (
                    <div className="chat chat-start">
                        <div className="chat-bubble bg-base-200 text-base-content">
                            <span className="loading loading-dots loading-sm"></span>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-base-300">
                <div className="flex gap-2">
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question..."
                        className="textarea textarea-bordered flex-1 resize-none"
                        rows={2}
                        disabled={isStreaming}
                    />
                    <button className="btn btn-primary self-end" onClick={handleSend} disabled={!message.trim() || isStreaming}>
                        {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface RoleplaySession {
    signedUrl: string;
}

interface PrepDetailPageProps {
    prepId: string;
}

export function PrepDetailPage({ prepId: prepIdStr }: PrepDetailPageProps) {
    const [, navigate] = useLocation();
    const prepId = parseInt(prepIdStr ?? '0', 10);

    const { data, isLoading, error, refetch } = useMeetingPrep(prepId);
    const generateGuide = useGeneratePrepGuide();
    const startRoleplay = useStartPrepRoleplay();

    const [localChatHistory, setLocalChatHistory] = useState<ChatMessage[]>([]);
    const [roleplaySession, setRoleplaySession] = useState<RoleplaySession | null>(null);

    const prep = data?.prep as MeetingPrep | undefined;

    // Sync chat history from server
    useEffect(() => {
        if (prep?.chatHistory && localChatHistory.length === 0) {
            setLocalChatHistory(prep.chatHistory);
        }
    }, [prep?.chatHistory, localChatHistory.length]);

    const handleGenerateGuide = async () => {
        try {
            await generateGuide.mutateAsync(prepId);
            refetch();
        } catch {
            // Error handled by mutation
        }
    };

    const handleNewMessage = (msg: ChatMessage) => {
        setLocalChatHistory((prev) => [...prev, msg]);
    };

    const handleStartRoleplay = async () => {
        try {
            const result = await startRoleplay.mutateAsync(prepId);
            if (result.signedUrl) {
                setRoleplaySession({ signedUrl: result.signedUrl });
            }
        } catch {
            // Error handled by mutation
        }
    };

    const handleCloseRoleplay = () => {
        setRoleplaySession(null);
    };

    const handleCompleteRoleplay = () => {
        setRoleplaySession(null);
        refetch();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (error || !prep) {
        return (
            <div className="p-6">
                <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/prep')}>
                    <ArrowLeft className="w-4 h-4" />
                    Back to Preps
                </button>
                <div className="alert alert-error">
                    <span>Failed to load meeting prep</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Roleplay Modal */}
            {roleplaySession && prep && (
                <PrepRoleplay
                    prepId={prepId}
                    signedUrl={roleplaySession.signedUrl}
                    prospectName={prep.prospectContactName ?? prep.prospectCompany}
                    prospectRole={prep.prospectContactRole}
                    prospectCompany={prep.prospectCompany}
                    onClose={handleCloseRoleplay}
                    onComplete={handleCompleteRoleplay}
                />
            )}

            {/* Header */}
            <div className="p-4 border-b border-base-300 bg-base-100">
                <div className="flex items-center gap-4">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/prep')}>
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-base-content/60" />
                            <h1 className="text-xl font-bold">{prep.prospectCompany}</h1>
                            <span className="badge badge-outline">{callTypeLabels[prep.callType]}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-base-content/70 mt-1">
                            {prep.prospectContactName && (
                                <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {prep.prospectContactName}
                                    {prep.prospectContactRole && ` (${prep.prospectContactRole})`}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                {prep.meetingGoal.slice(0, 50)}
                                {prep.meetingGoal.length > 50 && '...'}
                            </span>
                        </div>
                    </div>
                    <button className="btn btn-secondary" onClick={handleStartRoleplay} disabled={startRoleplay.isPending}>
                        {startRoleplay.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Starting...
                            </>
                        ) : (
                            <>
                                <Mic className="w-4 h-4" />
                                Practice Roleplay
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Content - Two Column Layout */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 bg-base-200/50">
                {/* Left: Prep Guide */}
                <div className="overflow-y-auto p-4">
                    <div className="card bg-base-100 shadow-sm h-full">
                        <div className="card-body p-5">
                            <h2 className="card-title text-lg">Prep Guide</h2>
                            <div className="divider my-1"></div>
                            <PrepGuide
                                guide={prep.prepGuide}
                                isLoading={generateGuide.isPending}
                                onRegenerate={handleGenerateGuide}
                            />
                        </div>
                    </div>
                </div>

                {/* Right: Chat */}
                <div className="flex flex-col min-h-0 p-4 pt-4 lg:pl-0">
                    <div className="card bg-base-100 shadow-sm flex-1 flex flex-col min-h-0">
                        <div className="card-body p-0 flex flex-col min-h-0">
                            <h2 className="card-title text-lg px-5 pt-5">Ask Questions</h2>
                            <div className="divider my-1 mx-5"></div>
                            <PrepChat prepId={prepId} chatHistory={localChatHistory} onNewMessage={handleNewMessage} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
