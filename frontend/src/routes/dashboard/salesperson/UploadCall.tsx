import { useState } from 'react';
import { Upload, CheckCircle2, FileAudio, FileVideo, AlertCircle } from 'lucide-react';
import { addNotification } from '#/routes/dashboard/layout/Notifications';
import { useLocation } from 'wouter';

export function UploadCall() {
    const [_location, navigate] = useLocation();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadComplete, setUploadComplete] = useState(false);
    const [uploadedFileInfo, setUploadedFileInfo] = useState<{ fileName: string; fileId: number } | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const handleFileValidation = (file: File): string | null => {
        // Check if it's audio or video
        const isAudio = file.type.startsWith('audio/');
        const isVideo = file.type.startsWith('video/');
        const hasAudioVideoExtension = /\.(mp3|wav|m4a|aac|mp4|mov|avi|mkv|webm)$/i.test(file.name);

        if (!isAudio && !isVideo && !hasAudioVideoExtension) {
            return 'Please upload an audio or video file (mp3, wav, m4a, aac, mp4, mov, avi, mkv, webm)';
        }

        // Check file size (2GB for video, 100MB for audio)
        const isVideoFile = isVideo || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
        const maxSize = isVideoFile ? 2 * 1024 * 1024 * 1024 : 100 * 1024 * 1024;
        if (file.size > maxSize) {
            const maxSizeMB = Math.floor(maxSize / (1024 * 1024));
            return `File size must be less than ${maxSizeMB}MB`;
        }

        return null;
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const file = files[0];

        // Validate file
        const validationError = handleFileValidation(file);
        if (validationError) {
            addNotification(validationError, 'error');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);
        setUploadComplete(false);

        try {
            // Create form data for upload
            const formData = new FormData();
            formData.append('file', file);

            setUploadProgress(30);

            // Upload to backend using raw fetch (FormData doesn't work well with Hono client)
            const uploadResponse = await fetch('/vantage/api/upload/local', {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.error || 'Failed to upload file');
            }

            const result = await uploadResponse.json();

            setUploadProgress(100);
            setUploadedFileInfo({
                fileName: file.name,
                fileId: result.fileId,
            });
            setUploadComplete(true);
            addNotification('Call uploaded successfully - analysis in progress', 'success');
        } catch (error) {
            console.error('Upload error:', error);
            addNotification(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            setUploadProgress(0);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleFileUpload(e.dataTransfer.files);
    };

    const handleReset = () => {
        setUploadComplete(false);
        setUploadedFileInfo(null);
        setUploadProgress(0);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Upload Sales Call</h1>
                <p className="text-base-content/70 mt-2">
                    Upload your sales call recording for AI-powered analysis and personalized training insights
                </p>
            </div>

            {!uploadComplete ? (
                <div className="card bg-base-200 shadow-xl">
                    <div className="card-body">
                        {/* Upload Area */}
                        <div
                            role="button"
                            tabIndex={0}
                            className={`
                                border-2 border-dashed rounded-lg p-12 text-center transition-colors
                                ${dragActive ? 'border-primary bg-primary/10' : 'border-base-content/30 hover:border-primary/50'}
                                ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => {
                                if (!isUploading) {
                                    document.getElementById('file-upload')?.click();
                                }
                            }}
                            onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
                                    e.preventDefault();
                                    document.getElementById('file-upload')?.click();
                                }
                            }}
                        >
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.mp4,.mov,.avi,.mkv,.webm"
                                onChange={(e) => handleFileUpload(e.target.files)}
                                disabled={isUploading}
                            />

                            {isUploading ? (
                                <div className="space-y-4">
                                    <div className="flex justify-center">
                                        <span className="loading loading-spinner loading-lg text-primary"></span>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-lg font-medium">Uploading...</p>
                                        <progress
                                            className="progress progress-primary w-full max-w-xs mx-auto"
                                            value={uploadProgress}
                                            max="100"
                                        ></progress>
                                        <p className="text-sm text-base-content/70">{uploadProgress}%</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex justify-center">
                                        <Upload className="w-16 h-16 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-lg font-medium mb-2">Drag and drop your call recording here</p>
                                        <p className="text-sm text-base-content/70 mb-4">or click to browse files</p>
                                        <div className="flex flex-wrap gap-2 justify-center text-xs text-base-content/60">
                                            <div className="flex items-center gap-1">
                                                <FileAudio className="w-4 h-4" />
                                                <span>Audio: MP3, WAV, M4A, AAC</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <FileVideo className="w-4 h-4" />
                                                <span>Video: MP4, MOV, AVI, MKV, WEBM</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* File size limits info */}
                        <div className="mt-4 flex items-start gap-2 text-sm text-base-content/70">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div>
                                <p>Maximum file sizes: 100MB for audio files, 2GB for video files</p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* Success State */
                <div className="card bg-base-200 shadow-xl">
                    <div className="card-body">
                        <div className="text-center space-y-6">
                            <div className="flex justify-center">
                                <CheckCircle2 className="w-20 h-20 text-success" />
                            </div>

                            <div>
                                <h2 className="text-2xl font-bold text-success mb-2">Call Uploaded Successfully!</h2>
                                <p className="text-base-content/70">Your call is being processed for analysis</p>
                            </div>

                            {/* Uploaded File Info */}
                            {uploadedFileInfo && (
                                <div className="card bg-base-300 shadow">
                                    <div className="card-body py-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <FileAudio className="w-5 h-5 text-primary" />
                                                <div className="text-left">
                                                    <p className="font-medium">{uploadedFileInfo.fileName}</p>
                                                    <p className="text-xs text-base-content/60">File ID: {uploadedFileInfo.fileId}</p>
                                                </div>
                                            </div>
                                            <div className="badge badge-info">Processing</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button type="button" className="btn btn-primary" onClick={() => navigate('/calls')}>
                                    View Call Library
                                </button>
                                <button type="button" className="btn btn-outline" onClick={handleReset}>
                                    Upload Another Call
                                </button>
                            </div>

                            {/* What happens next */}
                            <div className="alert alert-info">
                                <div className="text-left space-y-2">
                                    <p className="font-semibold">What happens next?</p>
                                    <ul className="list-disc list-inside text-sm space-y-1">
                                        <li>Your call will be transcribed and analyzed</li>
                                        <li>AI will identify key moments and training opportunities</li>
                                        <li>You'll receive personalized feedback and insights</li>
                                        <li>Check the Call Library to view your processed call</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
