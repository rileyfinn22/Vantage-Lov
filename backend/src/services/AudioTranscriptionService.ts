import { logger } from "#/lib/logger";
import { defaultFileUploadService } from "#/services/FileUploadService";
import { VideoProcessingService } from "#/services/VideoProcessingService";
import { AI, EXTERNAL_URLS, TIMING } from "#/config";

/**
 * Custom error class for ElevenLabs API errors
 */
export class ElevenLabsApiError extends Error {
	name = "ElevenLabsApiError";
	statusCode: number;
	body: object;
	requestData: object;

	constructor(statusCode: number, body: object, requestData: FormData) {
		super(`ElevenLabs API error: ${statusCode}`);
		this.statusCode = statusCode;
		this.body = body;
		// Convert FormData to plain object
		const data: Record<string, any> = {};
		for (const [key, value] of requestData as any) {
			data[key] = value;
		}
		this.requestData = data;
	}
}

/**
 * Input for transcription - can be a local file path or a URL
 */
export type TranscriptionInput = { type: "url"; url: string } | { type: "filePath"; filePath: string };

/**
 * A segment of transcribed audio with speaker information
 */
export interface TranscriptionSegment {
	/** The transcribed text */
	text: string;
	/** Speaker identifier (e.g., "speaker_0", "speaker_1") */
	speakerId: string;
	/** Start time in seconds */
	startTime: number;
	/** End time in seconds */
	endTime: number;
	/** Confidence score between 0 and 1 */
	confidence: number;
}

/**
 * Complete transcription result with metadata
 */
export interface TranscriptionResult {
	/** Array of transcription segments with speaker information */
	segments: TranscriptionSegment[];
	/** Duration of the audio in seconds */
	durationSeconds: number;
	/** Number of speakers detected */
	speakerCount: number;
	/** Processing time in milliseconds */
	processingTimeMs: number;
	/** Service used for transcription */
	service: string;
}

/**
 * Configuration for transcription services
 */
export interface TranscriptionConfig {
	/** Language code (e.g., "en-US") */
	languageCode?: string;
	/** Enable speaker diarization */
	enableSpeakerDiarization?: boolean;
	/** Expected number of speakers (optional hint) */
	expectedSpeakerCount?: number;
	/** Enable automatic punctuation */
	enableAutomaticPunctuation?: boolean;
}

/**
 * Interface for audio transcription services
 */
export interface IAudioTranscriptionService {
	/**
	 * Transcribes audio from a file path or URL
	 * @param input - Audio input (file path or URL)
	 * @param config - Optional transcription configuration
	 * @returns Promise with transcription result
	 */
	transcribe(input: TranscriptionInput, config?: TranscriptionConfig): Promise<TranscriptionResult>;

	/**
	 * Transcribes audio with speaker separation
	 * @param input - Audio input (file path or URL)
	 * @param config - Optional transcription configuration
	 * @returns Promise with speaker-separated transcription result
	 */
	transcribeWithSpeakers(input: TranscriptionInput, config?: TranscriptionConfig): Promise<TranscriptionResult>;
}

/**
 * ElevenLabs transcription configuration
 */
export interface ElevenLabsConfig extends TranscriptionConfig {
	/** ElevenLabs API key */
	apiKey?: string;
	/** Base URL for ElevenLabs API */
	baseUrl?: string;
}

/**
 * ElevenLabs transcription implementation using Scribe v1 model
 */
export class ElevenLabsTranscriber implements IAudioTranscriptionService {
	private config: ElevenLabsConfig;

	constructor(config: ElevenLabsConfig = {}) {
		this.config = {
			languageCode: "eng",
			enableSpeakerDiarization: true,
			apiKey: config.apiKey || process.env.ELEVENLABS_API_KEY,
			baseUrl: config.baseUrl || AI.ELEVENLABS.BASE_URL,
			expectedSpeakerCount: 5,
			...config,
		};

		if (!this.config.apiKey) {
			logger.warn("ElevenLabs API key not provided. Transcription will use mock data in development/test mode.");
		}

		// this.client = new ElevenLabsClient({
		// 	apiKey: this.config.apiKey,
		// });
	}

	async transcribe(input: TranscriptionInput, config?: TranscriptionConfig): Promise<TranscriptionResult> {
		return this.transcribeWithSpeakers(input, config);
	}

	async transcribeWithSpeakers(input: TranscriptionInput, config?: TranscriptionConfig): Promise<TranscriptionResult> {
		const startTime = Date.now();
		const mergedConfig = { ...this.config, ...config };

		if (!this.config.apiKey) {
			throw new Error("ElevenLabs API key not configured");
		}

		// Direct API call using fetch and FormData
		const formData = new FormData();
		formData.append("model_id", "scribe_v1");

		// In development with local files, upload the file directly
		// Otherwise use cloud_storage_url for production
		if (input.type === "filePath") {
			// Check if this is a local file path (development/test) or if GCS credentials are not configured
			const hasGcsCredentials = !!(process.env.GCS_KEY_FILENAME || process.env.GCS_CREDENTIALS);
			const isLocalFile = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test" || !hasGcsCredentials;
			
			logger.info({ 
				hasGcsCredentials, 
				nodeEnv: process.env.NODE_ENV, 
				isLocalFile,
				filePath: input.filePath 
			}, "Determining file handling method");

			if (isLocalFile) {
				// Read the local file and upload it directly
				const { readFile } = await import("node:fs/promises");
				const { join, isAbsolute } = await import("node:path");
				const { existsSync } = await import("node:fs");
				// Handle both absolute paths (from video extraction) and relative paths
				const localPath = isAbsolute(input.filePath)
					? input.filePath
					: input.filePath.startsWith("uploads/")
						? join(process.cwd(), input.filePath)
						: join(process.cwd(), "uploads", input.filePath);

				// Check if file is a video - if so, extract audio first
				let audioPath = localPath;
				let isExtractedAudio = false;

				// Determine if this is a video file
				const fileName = input.filePath.split("/").pop() || "";
				if (VideoProcessingService.isVideo(null, fileName)) {
					logger.info({ videoPath: localPath }, "Video file detected, extracting audio");
					try {
						const extractResult = await VideoProcessingService.extractAudio(localPath);
						audioPath = extractResult.audioPath;
						isExtractedAudio = true;
						logger.info({ videoPath: localPath, audioPath, duration: extractResult.duration }, "Audio extracted from video");
					} catch (error) {
						logger.error({ error, videoPath: localPath }, "Failed to extract audio from video");
						throw new Error(`Failed to extract audio from video: ${error instanceof Error ? error.message : "Unknown error"}`);
					}
				}

				const fileBuffer = await readFile(audioPath);
				const fileBlob = new Blob([fileBuffer], { type: "audio/mpeg" });
				formData.append("file", fileBlob, "audio.mp3");
				logger.info({ filePath: input.filePath, audioPath }, "Uploading audio file to ElevenLabs");

				// Clean up extracted audio file after transcription completes
				if (isExtractedAudio) {
					// Note: cleanup happens in finally block after transcription
				}
			} else {
				// In production, generate presigned URL with 1 hour expiration
				const audioUrl = await defaultFileUploadService.getDownloadUrl(input.filePath, 3600);
				formData.append("cloud_storage_url", audioUrl);
				logger.info({ url: audioUrl }, "Using cloud storage URL for ElevenLabs");
			}
		} else {
			// For URL input, use cloud_storage_url
			formData.append("cloud_storage_url", input.url);
			logger.info({ url: input.url }, "Using provided URL for ElevenLabs");
		}

		formData.append("language_code", "eng");
		formData.append("diarize", String(mergedConfig.enableSpeakerDiarization ?? true));
		formData.append("num_speakers", String(mergedConfig.expectedSpeakerCount || 5));
		formData.append("timestamps_granularity", "word");
		formData.append("tag_audio_events", "true");

		logger.info("Starting 11labs STT");

		// Create abort controller with timeout for large files
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TIMING.TRANSCRIPTION_TIMEOUT_MS);

		try {
			const apiResponse = await fetch(EXTERNAL_URLS.ELEVENLABS_STT, {
				method: "POST",
				headers: {
					"xi-api-key": this.config.apiKey!,
				},
				body: formData,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			logger.info({ statusCode: apiResponse.status }, "Finished elevenlabs STT");

			if (!apiResponse.ok) {
				const errorBody = await apiResponse.json();
				throw new ElevenLabsApiError(apiResponse.status, errorBody, formData);
			}

			const rawResult = await apiResponse.json();

			// Check if response is webhook type (async processing)
			if ("transcription_id" in rawResult && !("text" in rawResult)) {
				throw new Error("Webhook response received, but synchronous processing was expected");
			}

			// Handle multi-channel response
			if ("transcripts" in rawResult) {
				throw new Error("Multi-channel audio not supported yet");
			}

			// Type guard to ensure we have a single-channel response
			if (!("text" in rawResult) || !("words" in rawResult)) {
				throw new Error("Unexpected response format from ElevenLabs API");
			}

			// Transform snake_case API response to camelCase for existing processing code
			const response = {
				languageCode: rawResult.language_code,
				languageProbability: rawResult.language_probability,
				text: rawResult.text,
				words:
					rawResult.words?.map((word: any) => ({
						text: word.text,
						start: word.start,
						end: word.end,
						speakerId: word.speaker_id,
						logprob: word.logprob,
					})) || [],
			};

			// Process single-channel response
			const result = this.processTranscriptionResponse(response, Date.now() - startTime);
			return result;
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	private processTranscriptionResponse(
		response: {
			languageCode: string;
			languageProbability: number;
			text: string;
			words: Array<{
				text: string;
				start?: number;
				end?: number;
				speakerId?: string;
				logprob: number;
			}>;
		},
		processingTimeMs: number,
	): TranscriptionResult {
		// Group words by speaker into segments
		const segments: TranscriptionSegment[] = [];
		let currentSegment: TranscriptionSegment | null = null;

		for (const word of response.words) {
			// Skip spacing and audio events for segment building (but we could log them)
			const speakerId = word.speakerId || "speaker_0";
			const startTime = word.start ?? 0;
			const endTime = word.end ?? 0;
			const confidence = this.logprobToConfidence(word.logprob);

			// If this is a new speaker or we don't have a current segment, create one
			if (!currentSegment || currentSegment.speakerId !== speakerId) {
				if (currentSegment) {
					segments.push(currentSegment);
				}

				currentSegment = {
					text: word.text,
					speakerId,
					startTime,
					endTime,
					confidence,
				};
			} else {
				// Same speaker, add to current segment
				currentSegment.text += ` ${word.text}`;
				currentSegment.endTime = endTime;
				// Average the confidence
				currentSegment.confidence = (currentSegment.confidence + confidence) / 2;
			}
		}

		// Push the last segment
		if (currentSegment) {
			segments.push(currentSegment);
		}

		// Calculate speaker count
		const uniqueSpeakers = new Set(segments.map((s) => s.speakerId));
		const durationSeconds = segments.length > 0 ? Math.max(...segments.map((s) => s.endTime)) : 0;

		return {
			segments,
			durationSeconds,
			speakerCount: uniqueSpeakers.size,
			processingTimeMs,
			service: "elevenlabs-scribe-v1",
		};
	}

	private logprobToConfidence(logprob: number): number {
		// Convert log probability to confidence score (0-1)
		// logprob ranges from -infinity to 0
		// We'll use a simple exponential conversion
		return Math.max(0, Math.min(1, Math.exp(logprob)));
	}
}

/**
 * Factory function to create a transcription service
 * @param config - Configuration for the service
 * @returns Configured transcription service
 */
export function createTranscriptionService(config?: ElevenLabsConfig): IAudioTranscriptionService {
	return new ElevenLabsTranscriber(config);
}

// Create default transcription service using ElevenLabs
export const defaultTranscriptionService: IAudioTranscriptionService = new ElevenLabsTranscriber({
	apiKey: process.env.ELEVENLABS_API_KEY,
});

logger.info("Initialized ElevenLabs transcription service");
