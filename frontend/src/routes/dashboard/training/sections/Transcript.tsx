import { tw } from '#util/tw';
import { formatDateShort } from '#util';
import { Users, MessageSquare } from 'lucide-react';
import TranscriptViewer, { type TranscriptionData } from '#components/TranscriptViewer';

const SectionHeader = tw.h2`text-lg font-semibold flex items-center gap-2`;
const TranscriptSection = tw.div`space-y-3`;

interface TranscriptProps {
    relatedInteraction: any;
    transcriptData: TranscriptionData | null;
    flagData: any;
}

export function Transcript({ relatedInteraction, transcriptData, flagData }: TranscriptProps) {
    const whatHappened = flagData?.flagData?.what_happened;

    return (
        <>
            <SectionHeader>
                <MessageSquare className="w-5 h-5" />
                What Happened
            </SectionHeader>
            <TranscriptSection>
                {/* What Happened - narrative description from AI analysis */}
                {whatHappened ? (
                    <div className="bg-base-300/50 rounded-lg p-4">
                        <p className="text-sm leading-relaxed">{whatHappened}</p>
                    </div>
                ) : (
                    <div className="text-sm text-base-content/60 italic">No description available for this flag</div>
                )}

                {/* Full Transcript Viewer */}
                {transcriptData ? (
                    <div className="flex justify-center pt-2 border-t border-base-300">
                        <TranscriptViewer
                            trigger={
                                <span className="flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    View Full Transcript
                                </span>
                            }
                            transcriptData={transcriptData}
                            fileName={`Call Recording - ${formatDateShort(flagData?.createdAt) || 'Unknown'}`}
                        />
                    </div>
                ) : (
                    <div className="alert alert-warning">
                        <Users className="w-5 h-5" />
                        <span>Transcript not yet processed</span>
                    </div>
                )}
            </TranscriptSection>
        </>
    );
}
