import { logger } from "#/lib/logger";
import { existsSync } from "node:fs";

// Lazy-load ffmpeg to avoid loading native modules on unsupported platforms (e.g., Windows ARM64)
let ffmpegInstance: typeof import("fluent-ffmpeg") | null = null;

async function getFfmpeg() {
	if (!ffmpegInstance) {
		const [ffmpeg, ffmpegInstaller] = await Promise.all([import("fluent-ffmpeg"), import("@ffmpeg-installer/ffmpeg")]);
		ffmpegInstance = ffmpeg.default;
		ffmpegInstance.setFfmpegPath(ffmpegInstaller.default.path);
	}
	return ffmpegInstance;
}

export interface VideoProcessingResult {
	audioPath: string;
	duration: number; // in seconds
	fileSize: number; // in bytes
}

export class VideoProcessingService {
	/**
	 * Extract audio from video file
	 * @param videoPath - Absolute path to the video file
	 * @param outputPath - Optional absolute path for the extracted audio (default: same directory with .mp3 extension)
	 * @returns Promise with extracted audio file path and metadata
	 */
	static async extractAudio(videoPath: string, outputPath?: string): Promise<VideoProcessingResult> {
		if (!existsSync(videoPath)) {
			throw new Error(`Video file not found: ${videoPath}`);
		}

		// Generate output path if not provided
		const audioPath = outputPath ?? videoPath.replace(/\.[^.]+$/, ".mp3");

		logger.info({ videoPath, audioPath }, "Extracting audio from video");

		const ffmpeg = await getFfmpeg();

		return new Promise((resolve, reject) => {
			ffmpeg(videoPath)
				.noVideo() // Remove video stream
				.audioCodec("libmp3lame") // Convert to MP3
				.audioBitrate(128) // 128 kbps for good quality and reasonable file size
				.audioChannels(1) // Mono (sufficient for speech, smaller file size)
				.audioFrequency(44100) // Standard frequency
				.on("start", (commandLine) => {
					logger.debug({ commandLine }, "FFmpeg command started");
				})
				.on("progress", (progress) => {
					logger.debug({ progress }, "FFmpeg progress");
				})
				.on("end", async () => {
					try {
						// Get file metadata
						const stats = await import("node:fs/promises").then((fs) => fs.stat(audioPath));
						const fileSize = stats.size;

						// Get duration
						ffmpeg.ffprobe(audioPath, (err, metadata) => {
							if (err) {
								logger.error({ error: err }, "Failed to get audio duration");
								reject(err);
								return;
							}

							const duration = metadata.format.duration ?? 0;
							logger.info({ audioPath, duration, fileSize }, "Audio extraction completed");

							resolve({
								audioPath,
								duration,
								fileSize,
							});
						});
					} catch (error) {
						logger.error({ error }, "Failed to read extracted audio file");
						reject(error);
					}
				})
				.on("error", (err) => {
					logger.error({ error: err, videoPath }, "Failed to extract audio from video");
					reject(new Error(`Audio extraction failed: ${err.message}`));
				})
				.save(audioPath);
		});
	}

	/**
	 * Get video metadata (duration, resolution, codec, etc.)
	 * @param videoPath - Absolute path to the video file
	 * @returns Promise with video metadata
	 */
	static async getVideoMetadata(videoPath: string): Promise<import("fluent-ffmpeg").FfprobeData> {
		if (!existsSync(videoPath)) {
			throw new Error(`Video file not found: ${videoPath}`);
		}

		const ffmpeg = await getFfmpeg();

		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(videoPath, (err, metadata) => {
				if (err) {
					logger.error({ error: err, videoPath }, "Failed to get video metadata");
					reject(err);
					return;
				}

				logger.info(
					{
						videoPath,
						duration: metadata.format.duration,
						size: metadata.format.size,
						format: metadata.format.format_name,
					},
					"Video metadata retrieved",
				);

				resolve(metadata);
			});
		});
	}

	/**
	 * Check if file is a video file based on mime type or extension
	 * @param mimeType - MIME type of the file
	 * @param fileName - Name of the file
	 * @returns True if file is a video
	 */
	static isVideo(mimeType: string | undefined | null, fileName: string): boolean {
		if (mimeType?.startsWith("video/")) {
			return true;
		}

		const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v"];
		return videoExtensions.some((ext) => fileName.toLowerCase().endsWith(ext));
	}
}
