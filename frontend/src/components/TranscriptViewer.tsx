import { useState } from 'react';
import {
    useFloating,
    autoUpdate,
    useClick,
    useDismiss,
    useInteractions,
    FloatingPortal,
    FloatingFocusManager,
    FloatingOverlay,
} from '@floating-ui/react';
import { FileText, Timer, Users, Wrench } from 'lucide-react';

export interface TranscriptionSegment {
    text: string;
    speakerId: string;
    startTime: number;
    endTime: number;
    confidence: number;
}

export interface TranscriptionData {
    segments: TranscriptionSegment[];
    durationSeconds: number;
    speakerCount: number;
    processingTimeMs: number;
    service: string;
}

interface TranscriptViewerProps {
    trigger: React.ReactNode;
    transcriptData: TranscriptionData | null;
    fileName: string;
}

const TranscriptViewer = ({ trigger, transcriptData, fileName }: TranscriptViewerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const { refs, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        whileElementsMounted: autoUpdate,
    });

    const click = useClick(context);
    const dismiss = useDismiss(context, {
        outsidePress: false,
    });

    const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

    if (!transcriptData) return <>{trigger}</>;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getSpeakerColor = (speakerId: string) => {
        const colors = [
            'text-blue-600 bg-blue-50',
            'text-green-600 bg-green-50',
            'text-purple-600 bg-purple-50',
            'text-orange-600 bg-orange-50',
            'text-pink-600 bg-pink-50',
            'text-cyan-600 bg-cyan-50',
        ];
        const index = parseInt(speakerId.replace('speaker_', '')) || 0;
        return colors[index % colors.length];
    };

    const filteredSegments = transcriptData.segments.filter(
        (segment) => searchTerm === '' || segment.text.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    return (
        <>
            <button
                ref={refs.setReference}
                {...getReferenceProps()}
                className="btn btn-ghost btn-sm underline text-blue-600 hover:text-blue-800"
            >
                {trigger}
            </button>

            {isOpen && (
                <FloatingPortal>
                    <FloatingOverlay
                        lockScroll
                        className="z-50 flex items-center justify-center bg-base-content/50 backdrop-blur-sm p-4"
                        onClick={(event) => {
                            if (event.target === event.currentTarget) {
                                setIsOpen(false);
                            }
                        }}
                    >
                        <FloatingFocusManager context={context} modal>
                            <div
                                ref={refs.setFloating}
                                {...getFloatingProps({
                                    className:
                                        'relative flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-base-content/30 bg-base-200 shadow-2xl',
                                    role: 'dialog',
                                    'aria-modal': true,
                                })}
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-4 border-b border-base-content/20 p-6 pb-4">
                                    <div className="flex-1">
                                        <h3 className="text-2xl font-semibold mb-2">Transcript Viewer</h3>
                                        <div className="flex flex-wrap gap-4 text-sm text-base-content/70">
                                            <span className="flex items-center gap-1">
                                                <FileText className="w-4 h-4" /> {fileName}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Timer className="w-4 h-4" /> {formatTime(transcriptData.durationSeconds)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Users className="w-4 h-4" /> {transcriptData.speakerCount} speakers
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Wrench className="w-4 h-4" /> {transcriptData.service}
                                            </span>
                                        </div>
                                    </div>
                                    <button onClick={() => setIsOpen(false)} className="btn btn-sm btn-ghost" aria-label="Close dialog">
                                        ✕
                                    </button>
                                </div>

                                {/* Search Bar */}
                                <div className="p-4 border-b border-base-content/20">
                                    <input
                                        type="text"
                                        placeholder="Search transcript..."
                                        className="input input-bordered w-full"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    {searchTerm && (
                                        <div className="text-xs text-base-content/60 mt-1">
                                            {filteredSegments.length} of {transcriptData.segments.length} segments match
                                        </div>
                                    )}
                                </div>

                                {/* Transcript Content */}
                                <div className="flex-1 overflow-hidden">
                                    <div className="h-full overflow-y-auto p-6 space-y-4">
                                        {filteredSegments.length === 0 ? (
                                            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-200/40 py-12">
                                                <p className="text-center text-base-content/60">
                                                    {searchTerm ? 'No segments match your search' : 'No transcript data available'}
                                                </p>
                                            </div>
                                        ) : (
                                            filteredSegments.map((segment) => (
                                                <div
                                                    key={`${segment.speakerId}-${segment.startTime}`}
                                                    className="flex gap-4 p-4 rounded-lg border border-base-200 bg-base-50"
                                                >
                                                    {/* Speaker Badge */}
                                                    <div className="flex-shrink-0">
                                                        <div
                                                            className={`px-3 py-1 rounded-full text-xs font-medium ${getSpeakerColor(segment.speakerId)}`}
                                                        >
                                                            {segment.speakerId.replace('speaker_', 'Speaker ')}
                                                        </div>
                                                        <div className="text-xs text-base-content/50 mt-1 text-center">
                                                            {formatTime(segment.startTime)}
                                                        </div>
                                                    </div>

                                                    {/* Transcript Text */}
                                                    <div className="flex-1">
                                                        <div className="text-base-content leading-relaxed">
                                                            {searchTerm
                                                                ? segment.text.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) =>
                                                                      part.toLowerCase() === searchTerm.toLowerCase() ? (
                                                                          <mark
                                                                              key={`${segment.startTime}-${i}`}
                                                                              className="bg-yellow-200 text-yellow-900 px-1 rounded"
                                                                          >
                                                                              {part}
                                                                          </mark>
                                                                      ) : (
                                                                          part
                                                                      ),
                                                                  )
                                                                : segment.text}
                                                        </div>
                                                        <div className="flex gap-4 text-xs text-base-content/50 mt-2">
                                                            <span>Duration: {(segment.endTime - segment.startTime).toFixed(1)}s</span>
                                                            <span>Confidence: {(segment.confidence * 100).toFixed(1)}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="border-t border-base-content/20 p-4">
                                    <div className="flex items-center justify-between text-xs text-base-content/60">
                                        <span>Processing time: {transcriptData.processingTimeMs}ms</span>
                                        <span>Total segments: {transcriptData.segments.length}</span>
                                    </div>
                                </div>
                            </div>
                        </FloatingFocusManager>
                    </FloatingOverlay>
                </FloatingPortal>
            )}
        </>
    );
};

export default TranscriptViewer;
