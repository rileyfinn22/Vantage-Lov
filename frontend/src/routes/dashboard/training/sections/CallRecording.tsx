import { tw } from '#util/tw';
import { Play, Video } from 'lucide-react';
import { MediaPlayer, type FlagMarker } from '#/components/MediaPlayer';

const SectionHeader = tw.h2`text-lg font-semibold flex items-center gap-2`;
const CallRecordingSection = tw.div`space-y-4`;

interface InteractionFlag {
    id: number;
    flagData?: {
        flag_title?: string;
        timestamps?: {
            start?: string | number;
        };
    } | null;
}

interface CallRecordingProps {
    audioFile:
        | {
              id: number;
              mimeType?: string | null;
          }
        | null
        | undefined;
    flagData:
        | {
              flagData?: {
                  timestamps?: {
                      start?: string | number;
                  };
              } | null;
          }
        | null
        | undefined;
    /** All flags for this interaction to display as markers on the timeline */
    interactionFlags?: InteractionFlag[];
    /** Callback when a flag marker is clicked */
    onFlagClick?: (flagId: number) => void;
}

export function CallRecording({ audioFile, flagData, interactionFlags = [], onFlagClick }: CallRecordingProps) {
    const isVideo = audioFile?.mimeType?.startsWith('video/');

    // Convert interaction flags to FlagMarker format for MediaPlayer
    const flagMarkers: FlagMarker[] = interactionFlags.map((flag) => ({
        id: flag.id,
        timestamp: flag.flagData?.timestamps?.start ?? null,
        title: flag.flagData?.flag_title,
    }));

    return (
        <>
            <SectionHeader>
                {isVideo ? <Video className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                Call Recording
            </SectionHeader>
            <CallRecordingSection>
                <MediaPlayer
                    fileId={audioFile?.id}
                    mimeType={audioFile?.mimeType}
                    startTimestamp={flagData?.flagData?.timestamps?.start}
                    flags={flagMarkers}
                    onFlagClick={onFlagClick}
                />
            </CallRecordingSection>
        </>
    );
}
