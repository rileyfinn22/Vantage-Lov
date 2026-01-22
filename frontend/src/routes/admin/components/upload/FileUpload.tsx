import { useState } from 'react';
import { useDelete } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import type { FileUploadProps } from '../types';
import { Paperclip } from 'lucide-react';
import { ho } from '#/data/client';

const FileUpload = ({ interactionId, onUploadComplete, className = '', existingFiles }: FileUploadProps) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [_dragActive, setDragActive] = useState(false);
    const { mutate: deleteFile } = useDelete();

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const file = files[0];
        if (file.size > 100 * 1024 * 1024) {
            // 100MB limit
            addNotification('File size must be less than 100MB', 'error');
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

            try {
                // Use local upload endpoint in development
                const formData = new FormData();
                formData.append('file', file);
                if (interactionId) {
                    formData.append('interactionId', interactionId.toString());
                }

                setUploadProgress(30);

                // Use regular fetch for file upload (Hono client doesn't handle FormData well)
                const uploadResponse = await fetch('/vantage/api/upload/local', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                });

                if (!uploadResponse.ok) {
                    throw new Error('Failed to upload file');
                }

                setUploadProgress(100);
                addNotification('File uploaded successfully', 'success');
                onUploadComplete();
            } catch (error) {
                console.error('Upload error:', error);
                addNotification(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
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
        </>
    );
};

export default FileUpload;
