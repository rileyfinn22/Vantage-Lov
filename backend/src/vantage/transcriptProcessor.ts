import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, lt, and } from "drizzle-orm";
import { createTranscriptionService } from "#/services/AudioTranscriptionService";
import { validateTranscriptionResult } from "#/data/transcription-types";
import { logger } from "#/lib/logger";
import { TIMING } from "#/config";
import { VideoProcessingService } from "#/services/VideoProcessingService";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";

// Initialize default transcription service (ElevenLabs)
// Use lazy initialization to ensure environment variables are loaded
let defaultTranscriptionService: ReturnType<typeof createTranscriptionService> | null = null;

function getTranscriptionService() {
	if (!defaultTranscriptionService) {
		const apiKey = process.env.ELEVENLABS_API_KEY;
		logger.info({ apiKeyConfigured: !!apiKey, apiKeyLength: apiKey?.length ?? 0 }, "Initializing ElevenLabs transcription service");
		defaultTranscriptionService = createTranscriptionService({
			apiKey,
		});
		logger.info("Initialized ElevenLabs transcription service");
	}
	return defaultTranscriptionService;
}

/**
 * Check if a file is a video file based on its mime type or extension
 */
function isVideoFile(mimeType: string | null | undefined, fileName: string): boolean {
	if (mimeType?.startsWith("video/")) {
		return true;
	}
	const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v"];
	return videoExtensions.some((ext) => fileName.toLowerCase().endsWith(ext));
}

/**
 * Process a transcript from an audio or video file
 * For video files, extracts audio first, then transcribes
 */
async function processTranscript(
	filePath: string,
	fileName: string,
	mimeType: string | null | undefined,
): Promise<{ transcription: ReturnType<typeof validateTranscriptionResult>; extractedAudioPath?: string }> {
	let audioFilePath = filePath;
	let extractedAudioPath: string | undefined;

	// If it's a video file, extract audio first
	if (isVideoFile(mimeType, fileName)) {
		logger.info({ filePath, fileName }, "Detected video file, extracting audio...");

		// Construct full local path for video file
		const fullVideoPath = join(process.cwd(), "uploads", filePath);

		if (!existsSync(fullVideoPath)) {
			throw new Error(`Video file not found at: ${fullVideoPath}`);
		}

		try {
			const result = await VideoProcessingService.extractAudio(fullVideoPath);
			audioFilePath = result.audioPath;
			extractedAudioPath = result.audioPath;

			logger.info(
				{
					videoPath: fullVideoPath,
					audioPath: result.audioPath,
					duration: result.duration,
					fileSize: result.fileSize,
				},
				"Audio extracted from video successfully",
			);
		} catch (error) {
			logger.error({ error, filePath }, "Failed to extract audio from video");
			throw new Error(`Failed to extract audio from video: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	// Use the AudioTranscriptionService to transcribe the audio
	let transcriptionResult;
	try {
		transcriptionResult = await getTranscriptionService().transcribeWithSpeakers(
			{ type: "filePath", filePath: audioFilePath },
			{
				languageCode: "en-US",
				enableSpeakerDiarization: true,
				enableAutomaticPunctuation: true,
			},
		);
	} catch (transcriptionError) {
		logger.error(
			{
				filePath: audioFilePath,
				fileName,
				error: transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError),
				stack: transcriptionError instanceof Error ? transcriptionError.stack : undefined,
			},
			"Failed to transcribe audio file",
		);
		throw transcriptionError;
	}

	logger.info(
		{
			fileName,
			duration: transcriptionResult.durationSeconds,
			speakers: transcriptionResult.speakerCount,
			processingTime: transcriptionResult.processingTimeMs,
			service: transcriptionResult.service,
			wasVideo: !!extractedAudioPath,
		},
		"Transcription completed",
	);

	// Validate the transcription result before returning
	const validatedResult = validateTranscriptionResult(transcriptionResult);
	return { transcription: validatedResult, extractedAudioPath };
}

export async function lookForUnprocessedFiles() {
	try {
		// Recover any interactions stuck in "processing" (e.g. after a server restart or crash)
		const staleThreshold = new Date(Date.now() - TIMING.STALE_INTERACTION_THRESHOLD_MS);
		const staleInteractions = await db
			.select({ id: schema.interactions.id })
			.from(schema.interactions)
			.where(and(eq(schema.interactions.processedStatus, "processing"), lt(schema.interactions.createdAt, staleThreshold)));
		if (staleInteractions.length > 0) {
			await db
				.update(schema.interactions)
				.set({ processedStatus: "unprocessed" })
				.where(and(eq(schema.interactions.processedStatus, "processing"), lt(schema.interactions.createdAt, staleThreshold)));
			logger.warn({ count: staleInteractions.length, ids: staleInteractions.map((i: { id: number }) => i.id) }, "Reset stale processing interactions back to unprocessed");
		}

		// Find interactions with associated files that need processing using a join
		const unprocessedWithFiles = await db
			.select({
				interaction: schema.interactions,
				file: schema.bigfiles,
			})
			.from(schema.interactions)
			.innerJoin(schema.bigfiles, eq(schema.interactions.id, schema.bigfiles.interactionId))
			.where(eq(schema.interactions.processedStatus, "unprocessed"));

		// Process each interaction
		for (const { interaction, file } of unprocessedWithFiles) {
			try {
				const isVideo = isVideoFile(file.mimeType, file.fileName);
				logger.info({ interactionId: interaction.id, fileName: file.fileName, isVideo }, "Starting to process interaction");

				// Verify file exists before processing (handles race condition with chunked uploads)
				const fullPath = join(process.cwd(), "uploads", file.filePath);
				if (!existsSync(fullPath)) {
					// Wait a bit and check again - file might still be writing
					await new Promise((resolve) => setTimeout(resolve, 5000));
					if (!existsSync(fullPath)) {
						logger.warn({ interactionId: interaction.id, filePath: fullPath }, "File not found, skipping for now");
						continue; // Skip this one, will be picked up on next run
					}
				}

				// Mark as processing
				await db.update(schema.interactions).set({ processedStatus: "processing" }).where(eq(schema.interactions.id, interaction.id));

				// Extract transcript (handles video extraction internally)
				const { transcription, extractedAudioPath } = await processTranscript(file.filePath, file.fileName, file.mimeType);

				// If we extracted audio from video, update the bigfiles record with video metadata
				if (isVideo && extractedAudioPath) {
					try {
						// Get video metadata
						const fullVideoPath = join(process.cwd(), "uploads", file.filePath);
						const videoMetadata = await VideoProcessingService.getVideoMetadata(fullVideoPath);

						// Store extracted audio as a new file record
						const [extractedAudioFile] = await db
							.insert(schema.bigfiles)
							.values({
								fileName: `${file.fileName.replace(/\.[^.]+$/, "")}_audio.mp3`,
								filePath: file.filePath.replace(/\.[^.]+$/, ".mp3"),
								mimeType: "audio/mpeg",
								interactionId: interaction.id,
							})
							.returning();

						// Update the original video file with metadata and link to extracted audio
						await db
							.update(schema.bigfiles)
							.set({
								extractedAudioFileId: extractedAudioFile.id,
								videoMetadata: {
									duration: videoMetadata.format.duration,
									width: videoMetadata.streams.find((s) => s.codec_type === "video")?.width,
									height: videoMetadata.streams.find((s) => s.codec_type === "video")?.height,
									codec: videoMetadata.streams.find((s) => s.codec_type === "video")?.codec_name,
									bitrate: videoMetadata.format.bit_rate ? Number(videoMetadata.format.bit_rate) : undefined,
								},
							})
							.where(eq(schema.bigfiles.id, file.id));

						logger.info(
							{
								interactionId: interaction.id,
								videoFileId: file.id,
								extractedAudioFileId: extractedAudioFile.id,
							},
							"Video metadata and extracted audio stored",
						);
					} catch (metadataError) {
						logger.warn({ error: metadataError, interactionId: interaction.id }, "Failed to store video metadata, continuing without it");
					}
				}

				// Mark as processed and save transcript to interaction
				await db
					.update(schema.interactions)
					.set({
						processedStatus: "processed",
						processedAt: new Date(),
						v1_raw_google_diarized: transcription,
					})
					.where(eq(schema.interactions.id, interaction.id));

				logger.info({ interactionId: interaction.id, fileName: file.fileName, isVideo }, "Successfully processed interaction");

				// Optionally clean up extracted audio file after transcription
				// Uncomment if you want to delete the extracted audio after processing:
				// if (extractedAudioPath && existsSync(extractedAudioPath)) {
				// 	await unlink(extractedAudioPath);
				// 	logger.info({ extractedAudioPath }, "Cleaned up extracted audio file");
				// }
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				const errorStack = error instanceof Error ? error.stack : undefined;
				logger.error(
					{
						interactionId: interaction.id,
						error: errorMessage,
						stack: errorStack,
						errorType: error?.constructor?.name,
						errorString: String(error),
					},
					"Error processing interaction",
				);

				// Mark as failed
				await db.update(schema.interactions).set({ processedStatus: "failed" }).where(eq(schema.interactions.id, interaction.id));
			}
		}
	} catch (error) {
		logger.error({ error }, "Error in file processor");
	}
}
