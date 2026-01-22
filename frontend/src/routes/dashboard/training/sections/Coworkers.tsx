import { tw } from '#util/tw';
import { Users, Play } from 'lucide-react';

const SectionHeader = tw.h2`text-lg font-semibold flex items-center gap-2`;

interface CoworkersProps {
    flagData: any;
}

// Seed data for coworker examples - showing how other reps handled similar situations
const seedCoworkerExamples = [
    {
        id: 'cw1',
        repName: 'Marcus Johnson',
        timeAgo: '2 days ago',
        duration: '1:23',
        technique: 'Budget Reframe Technique',
        transcription:
            'I hear you on budget constraints. Let me ask - when you say budget, are we talking cash flow timing or total approved spend? Because those are two very different conversations we could have.',
    },
    {
        id: 'cw2',
        repName: 'Sarah Kim',
        timeAgo: '1 week ago',
        duration: '2:15',
        technique: 'Value Anchoring Method',
        transcription:
            "That's exactly why we built our ROI calculator. Based on your team size, you'd break even in 4 months. Can we walk through those numbers together real quick?",
    },
    {
        id: 'cw3',
        repName: 'Alex Chen',
        timeAgo: '3 days ago',
        duration: '0:54',
        technique: 'Timeline Pivot Strategy',
        transcription:
            "Budget timing makes total sense. What if we structured this as a Q1 pilot with phased rollout? That way you're not hitting this quarter's budget at all.",
    },
];

export function Coworkers({ flagData }: CoworkersProps) {
    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <SectionHeader>
                    <Users className="w-5 h-5" />
                    Where Coworkers Crushed This
                </SectionHeader>
                <span className="badge badge-secondary badge-sm">Real Examples</span>
            </div>
            <p className="text-sm text-base-content/60 mb-4">See how other reps successfully handled similar objections</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {seedCoworkerExamples.map((example) => (
                    <div key={example.id} className="group relative">
                        <div className="bg-gradient-to-br from-base-200/50 to-base-200 rounded-lg p-3 border border-base-300 hover:border-primary/50 transition-all cursor-pointer hover:shadow-md">
                            {/* Clip Preview - smaller */}
                            <div className="relative bg-base-300/80 rounded-md mb-2 h-20 flex items-center justify-center group-hover:bg-base-300 transition-colors">
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded-md" />
                                <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center mb-1 group-hover:bg-primary/30 transition-colors">
                                        <Play className="w-3 h-3 text-primary" />
                                    </div>
                                    <div className="text-xs text-base-content/60">{example.duration}</div>
                                </div>
                            </div>

                            {/* Rep Info */}
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-5 h-5 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center">
                                    <span className="text-[10px] text-primary-content font-bold">{example.repName.charAt(0)}</span>
                                </div>
                                <div className="text-xs font-medium">{example.repName}</div>
                                <div className="text-[10px] text-base-content/60">• {example.timeAgo}</div>
                            </div>

                            {/* Technique Tag */}
                            <div className="text-xs font-medium text-primary mb-2">{example.technique}</div>

                            {/* Transcription */}
                            <div className="bg-base-300/30 rounded p-2 mb-2">
                                <div className="text-[10px] text-base-content/60 mb-1">What they said:</div>
                                <div className="text-xs italic line-clamp-2">"{example.transcription}"</div>
                            </div>

                            {/* Play Button */}
                            <div className="flex justify-center">
                                <button type="button" className="btn btn-ghost btn-xs h-6 text-[10px] hover:bg-primary/10">
                                    <Play className="w-2.5 h-2.5 mr-1" />
                                    Play Clip
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Benchmarking context if available */}
            {flagData.flagData?.benchmarking_context && (
                <div className="mt-4 bg-info/5 border-l-2 border-l-info rounded-lg p-4">
                    <p className="text-sm leading-relaxed">{flagData.flagData.benchmarking_context}</p>
                </div>
            )}
        </>
    );
}
