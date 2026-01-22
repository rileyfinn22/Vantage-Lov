import { useLocation } from 'wouter';
import { tw } from '#util/tw';
import { useTrainingFlag } from '#data/trainingFlag';
import { FlagHeader } from './sections/FlagHeader';
import { CallRecording } from './sections/CallRecording';
import { Transcript } from './sections/Transcript';
import { FlagAnalysis } from './sections/FlagAnalysis';
import { BetterResponse } from './sections/BetterResponse';
import { Coworkers } from './sections/Coworkers';
import { AIVoicePractice } from './sections/AIVoicePractice';
import { FlagRating } from './sections/FlagRating';
import { ArrowLeft } from 'lucide-react';

// Layout Components
const Grid = tw.div`grid grid-cols-1 lg:grid-cols-2 gap-6`;
const Section = tw.div`card bg-base-200 shadow-sm border border-base-content/30`;

// Top level Layout
const TopLevelLayout = tw.div`flex gap-2 flex-col`;
export function TrainingFlagDetail({ id }: { id: string }) {
    // Use new training flag hook
    const { loading, error, flagData, relatedInteraction, salespersonData, audioFile, transcriptData, interactionFlags } =
        useTrainingFlag(id);
    const [, navigate] = useLocation();

    const navigateToFlag = (direction: 'prev' | 'next') => {
        if (!salespersonData?.flags || salespersonData.flags.length === 0) return;

        const currentFlagIndex = salespersonData.flags.findIndex((flag: any) => flag.id === parseInt(id, 10));
        const targetIndex = direction === 'prev' ? currentFlagIndex - 1 : currentFlagIndex + 1;

        // Stop at boundaries (don't wrap around)
        if (targetIndex < 0 || targetIndex >= salespersonData.flags.length) return;

        const targetFlag = salespersonData.flags[targetIndex];
        navigate(`/training-flag/${targetFlag.id}`);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <span className="loading loading-spinner loading-lg"></span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-error">
                <span>Error loading flag data: {error.message ?? 'Unknown error'}</span>
            </div>
        );
    }

    if (!flagData) {
        return (
            <div className="alert alert-error">
                <span>Flag not found</span>
            </div>
        );
    }

    const totalFlags = salespersonData?.flags?.length ?? 0;
    const currentFlagIndex = salespersonData?.flags?.findIndex((flag: any) => flag.id === parseInt(id, 10)) ?? 0;

    return (
        <TopLevelLayout>
            {/* Back Button */}
            <div className="mb-4">
                <button onClick={() => window.history.back()} className="btn btn-ghost btn-xs gap-1" aria-label="Go back">
                    <ArrowLeft className="h-3 w-3" />
                    <span className="text-xs">Back</span>
                </button>
            </div>

            {/* Header Section */}
            <FlagHeader
                flagData={flagData}
                salespersonData={salespersonData}
                relatedInteraction={relatedInteraction}
                currentFlagIndex={currentFlagIndex}
                totalFlags={totalFlags}
                onNavigate={navigateToFlag}
            />

            {/* Evidence Row */}
            <Grid>
                {/* Call Recording Player */}
                <Section>
                    <div className="card-body">
                        <CallRecording
                            audioFile={audioFile}
                            flagData={flagData}
                            interactionFlags={interactionFlags}
                            onFlagClick={(flagId) => navigate(`/training-flag/${flagId}`)}
                        />
                    </div>
                </Section>

                {/* Conversation Transcript */}
                <Section>
                    <div className="card-body">
                        <Transcript relatedInteraction={relatedInteraction} transcriptData={transcriptData} flagData={flagData} />
                    </div>
                </Section>
            </Grid>

            {/* Analysis Row */}
            <Grid>
                {/* Revenue Impact */}
                <Section>
                    <div className="card-body">
                        <FlagAnalysis flagData={flagData} />
                    </div>
                </Section>

                {/* Why It Matters */}
                <Section className="border-l-4 border-l-primary">
                    <div className="card-body">
                        <h2 className="text-lg font-semibold mb-4">Why This Matters</h2>
                        <p className="text-sm leading-relaxed text-base-content/80">
                            {flagData.flagData?.why_this_matters
                                ? flagData.flagData.why_this_matters
                                      .split(/[.!?]+/)
                                      .slice(0, 4)
                                      .join('. ')
                                      .trim() + '.'
                                : 'No information available'}
                        </p>
                    </div>
                </Section>
            </Grid>

            {/* Better Responses - Full Width */}
            <Section>
                <div className="card-body">
                    <BetterResponse flagData={flagData} />
                </div>
            </Section>

            {/* Coworkers Section with real data */}
            <Section>
                <div className="card-body">
                    <Coworkers flagData={flagData} />
                </div>
            </Section>

            {/* Flag Rating & Report Issue */}
            <Section>
                <div className="card-body">
                    <FlagRating
                        flagId={parseInt(id, 10)}
                        currentRating={flagData.repRating}
                        hasReport={flagData.badFlagReport !== null && flagData.badFlagReport !== undefined}
                    />
                </div>
            </Section>

            {/* AI Voice Practice Session */}
            <Section>
                <div className="card-body">
                    <AIVoicePractice flagId={id} isCompleted={flagData.complete} trainingSession={flagData.trainingSession} />
                </div>
            </Section>
        </TopLevelLayout>
    );
}
