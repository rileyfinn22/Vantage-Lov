import { useUpdate, useDelete } from '@refinedev/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import TranscriptViewer from '#/components/TranscriptViewer';
import FileUpload from '../upload/FileUpload';
import type { InteractionFile } from '../types';
import { Download, Clock, CheckCircle, AudioWaveform, RefreshCw, XCircle } from 'lucide-react';
import { ho } from '#/data/client';
import type { InteractionWithRelationsAPI } from './useInteractionsWithRelations';

interface InteractionFilesProps {
    interactionId: number;
    bigfiles: InteractionWithRelationsAPI['bigfiles'];
    interaction: InteractionWithRelationsAPI;
}

const InteractionFiles = ({ interactionId, bigfiles, interaction }: InteractionFilesProps) => {
    const files = Array.isArray(bigfiles) ? (bigfiles as InteractionFile[]) : [];

    const queryClient = useQueryClient();
    const { mutate: updateInteraction } = useUpdate();
    const { mutate: deleteItem } = useDelete();

    const { mutate: reanalyze, isPending: isReanalyzing } = useMutation({
        mutationFn: async (id: number) => {
            const response = await ho.vantage.api.admin.interactions[':id']['reset-analysis'].$post({
                param: { id: String(id) },
            });

            if (!response.ok) {
                throw new Error('Failed to reset analysis');
            }

            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin'] });
            addNotification('Queued for re-analysis', 'success');
        },
        onError: (error) => {
            console.error('Re-analyze error:', error);
            addNotification('Failed to queue re-analysis', 'error');
        },
    });

    const handleDownload = async (fileId: number, fileName: string) => {
        try {
            const response = await ho.vantage.api.upload.download[':id'].$get({ param: { id: String(fileId) } });
            if (!response.ok) {
                throw new Error('Failed to get download URL');
            }

            const { downloadUrl } = await response.json();

            // Create a temporary link to trigger download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Download error:', error);
            addNotification('Failed to download file', 'error');
        }
    };

    const handleRetranscript = () => {
        updateInteraction(
            {
                resource: 'interactions',
                id: interactionId,
                values: {
                    processedStatus: 'unprocessed',
                    v1_raw_google_diarized: null,
                    processedAt: null,
                },
            },
            {
                onSuccess: () => {
                    addNotification('Queued for re-transcription', 'success');
                },
                onError: () => {
                    addNotification('Failed to queue re-transcription', 'error');
                },
            },
        );
    };

    const handleReanalyze = () => {
        reanalyze(interactionId);
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 flex-wrap">
                {files.length > 0 &&
                    files.map((file) => (
                        <div key={file.id} className="flex items-center gap-1 text-xs border border-base-300 rounded px-1.5 py-0.5">
                            <span className="truncate max-w-24" title={file.fileName}>
                                {file.fileName}
                            </span>
                            <button
                                type="button"
                                className="btn btn-xs btn-ghost p-0 h-auto min-h-0"
                                onClick={() => handleDownload(file.id, file.fileName)}
                                title="Download file"
                            >
                                <Download className="w-3 h-3" />
                            </button>
                        </div>
                    ))}

                {/* Processing status and actions inline */}
                {interaction && (
                    <div className="flex items-center gap-1 text-xs">
                        {/* Status indicators */}
                        {interaction.processedStatus === 'unprocessed' && (
                            <>
                                <Clock className="w-3 h-3 text-warning" />
                                <span className="text-warning">Waiting</span>
                            </>
                        )}
                        {interaction.processedStatus === 'processing' && (
                            <>
                                <span className="loading loading-spinner loading-xs"></span>
                                <span className="text-info">Processing</span>
                            </>
                        )}
                        {interaction.processedStatus === 'processed' && <CheckCircle className="w-3 h-3 text-success" />}
                        {interaction.processedStatus === 'failed' && (
                            <>
                                <XCircle className="w-3 h-3 text-error" />
                                <span className="text-error">Failed</span>
                            </>
                        )}

                        {/* Action buttons - available unless currently processing */}
                        {interaction.processedStatus !== 'processing' && (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-xs btn-ghost p-0 h-auto min-h-0"
                                    onClick={handleRetranscript}
                                    title="Re-transcript"
                                >
                                    <AudioWaveform className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-xs btn-ghost p-0 h-auto min-h-0"
                                    onClick={handleReanalyze}
                                    disabled={isReanalyzing}
                                    title="Re-analyze (ratings & flags)"
                                >
                                    <RefreshCw className={`w-3 h-3 ${isReanalyzing ? 'animate-spin' : ''}`} />
                                </button>
                            </>
                        )}
                    </div>
                )}

                <FileUpload
                    interactionId={interactionId}
                    onUploadComplete={() => {
                        queryClient.invalidateQueries({ queryKey: ['admin'] });
                    }}
                    existingFiles={files}
                />
            </div>

            {/* Show transcript if available - from interaction */}
            {interaction?.processedStatus === 'processed' && interaction.v1_raw_google_diarized && (
                <div className="text-xs">
                    <TranscriptViewer
                        trigger={<span className="link">View Transcript</span>}
                        transcriptData={interaction.v1_raw_google_diarized}
                        fileName={files[0]?.fileName ?? 'transcript'}
                    />
                </div>
            )}
        </div>
    );
};

export default InteractionFiles;
