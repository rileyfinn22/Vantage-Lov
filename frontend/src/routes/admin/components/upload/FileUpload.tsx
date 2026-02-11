import { useState } from 'react';
import { useDelete } from '@refinedev/core';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import type { FileUploadProps } from '../types';
import { Paperclip } from 'lucide-react';
import { uploadFileInChunks } from '#/util/chunkedUpload';

const FileUpload = ({ interactionId, onUploadComplete, className = '', existingFiles }: FileUploadProps) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [_dragActive, setDragActive] = useState(false);
    const { mutate: deleteFile } = useDelete();

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
