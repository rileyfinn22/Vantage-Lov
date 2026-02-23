import { useState, useEffect, useRef } from 'react';
import { useDelete } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import type { FileUploadProps } from '../types';
import { Paperclip, AlertTriangle } from 'lucide-react';
import { uploadFileInChunks } from '#/util/chunkedUpload';

const FileUpload = ({ interactionId, onUploadComplete, className = '', existingFiles }: FileUploadProps) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [_dragActive, setDragActive] = useState(false);
    const [pendingNavArgs, setPendingNavArgs] = useState<Parameters<typeof history.pushState> | null>(null);
    const originalPushState = useRef(window.history.pushState.bind(window.history));
    const { mutate: deleteFile } = useDelete();

    // Block browser refresh / tab close
    useEffect(() => {
        if (!isUploading) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isUploading]);

    // Intercept in-app navigation (wouter uses history.pushState)
    useEffect(() => {
        if (!isUploading) return;
        const orig = window.history.pushState.bind(window.history);
        originalPushState.current = orig;
        window.history.pushState = (...args: Parameters<typeof history.pushState>) => {
            setPendingNavArgs(args);
        };
        return () => {
            window.history.pushState = orig;
        };
    }, [isUploading]);

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const file = files[0];
        if (file.size > 2 * 1024 * 1024 * 1024) {
            // 2GB limit
            addNotification('File size must be less than 2GB', 'error');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            // Step 0: Delete existing file if one exists
            if (existingFiles && existingFiles.length > 0) {
                try {
                    await new Promise<void>((resolve, reject) => {
                        deleteFile(
                            {
                                resource: 'bigfiles',
                                id: existingFiles[0].id,
                            },
                            {
                                onSuccess: () => {
                                    addNotification('Replacing existing file...', 'info');
                                    resolve();
                                },
                                onError: (error) => {
                                    reject(error);
                                },
                            },
                        );
                    });
                } catch (error) {
                    console.error('Delete error:', error);
                    addNotification('Failed to delete existing file', 'error');
                    setIsUploading(false);
                    return; // Don't proceed with upload if delete failed
                }
            }

            // Use chunked upload for reliable large file uploads
            const result = await uploadFileInChunks(
                file,
                (progress) => {
                    setUploadProgress(progress.percentage);
                },
                interactionId
            );

            if (result.success) {
                setUploadProgress(100);
                addNotification('File uploaded successfully', 'success');
                onUploadComplete();
            } else {
                throw new Error(result.error ?? 'Upload failed');
            }
        } catch (error) {
            console.error('File replacement error:', error);
            addNotification(`File replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const _handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const _handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleFileUpload(e.dataTransfer.files);
    };

    const handleConfirmLeave = () => {
        if (pendingNavArgs) {
            const args = pendingNavArgs;
            setPendingNavArgs(null);
            originalPushState.current(...args);
        }
    };

    const handleCancelLeave = () => {
        setPendingNavArgs(null);
    };

    return (
        <>
            <input
                type="file"
                id={`file-upload-${interactionId}`}
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
                disabled={isUploading}
            />

            {isUploading ? (
                <div className="flex items-center gap-1 text-xs">
                    <span className="loading loading-spinner loading-xs"></span>
                    <span>{uploadProgress}%</span>
                </div>
            ) : (
                <label htmlFor={`file-upload-${interactionId}`} className="cursor-pointer inline-flex items-center" title="Upload file">
                    <Paperclip className="w-3 h-3 hover:text-primary" />
                </label>
            )}

            {/* Navigation warning modal */}
            {pendingNavArgs && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <AlertTriangle className="w-6 h-6 text-warning flex-shrink-0" />
                            <h3 className="font-bold text-lg">Upload in Progress</h3>
                        </div>
                        <p className="text-sm text-base-content/80">
                            Your file is still uploading. If you leave now, the upload will be cancelled and your file will not be saved.
                        </p>
                        <div className="modal-action">
                            <button className="btn btn-ghost btn-sm" onClick={handleCancelLeave}>
                                Stay on Page
                            </button>
                            <button className="btn btn-error btn-sm" onClick={handleConfirmLeave}>
                                Leave Anyway
                            </button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={handleCancelLeave} />
                </div>
            )}
        </>
    );
};

export default FileUpload;
