/**
 * Chunked file upload utility for reliable large file uploads
 * Uses large chunks uploaded sequentially for reliability
 */

const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks - fits within Fly.io 5min proxy timeout

interface ChunkUploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

interface ChunkUploadResult {
    success: boolean;
    fileId?: number;
    interactionId?: number;
    error?: string;
}

export async function uploadFileInChunks(
    file: File,
    onProgress: (progress: ChunkUploadProgress) => void,
    interactionId?: number
): Promise<ChunkUploadResult> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = crypto.randomUUID();
    let uploadedBytes = 0;

    // Upload chunks sequentially
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const chunkSize = end - start;

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('fileName', file.name);
        formData.append('fileSize', file.size.toString());
        formData.append('mimeType', file.type);
        if (interactionId) {
            formData.append('interactionId', interactionId.toString());
        }

        // Retry logic for each chunk
        let retries = 3;
        let success = false;
        let lastError: string | undefined;
        let result: unknown;

        while (retries > 0 && !success) {
            try {
                const response = await uploadChunkWithProgress(
                    formData,
                    (chunkLoaded) => {
                        const totalLoaded = uploadedBytes + chunkLoaded;
                        onProgress({
                            loaded: totalLoaded,
                            total: file.size,
                            percentage: Math.round((totalLoaded / file.size) * 100),
                        });
                    }
                );

                if (response.ok) {
                    success = true;
                    uploadedBytes += chunkSize;
                    result = await response.json();
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    lastError = errorData.error ?? `Server error: ${response.status}`;
                    retries--;
                }
            } catch (error) {
                lastError = error instanceof Error ? error.message : 'Network error';
                retries--;
                if (retries > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }
        }

        if (!success) {
            return { success: false, error: lastError ?? 'Upload failed after retries' };
        }

        // Check if this was the last chunk
        if (result && typeof result === 'object' && 'fileId' in result) {
            const finalResult = result as { fileId: number; interactionId: number };
            return {
                success: true,
                fileId: finalResult.fileId,
                interactionId: finalResult.interactionId,
            };
        }
    }

    return { success: false, error: 'Unexpected error' };
}

function uploadChunkWithProgress(
    formData: FormData,
    onProgress: (loaded: number) => void
): Promise<Response> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                onProgress(event.loaded);
            }
        });

        xhr.addEventListener('load', () => {
            resolve(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
            }));
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Network error'));
        });

        xhr.addEventListener('timeout', () => {
            reject(new Error('Request timeout'));
        });

        xhr.open('POST', '/vantage/api/upload/chunk');
        xhr.withCredentials = true;
        xhr.timeout = 600000; // 10 minute timeout per chunk
        xhr.send(formData);
    });
}
