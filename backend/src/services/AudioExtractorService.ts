import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { TranscoderServiceClient } from "@google-cloud/video-transcoder";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { getTenantPrefixedPath } from "#/lib/tenant";

/**
 * Result interface for audio extraction operations
 */
export interface AudioExtractionResult {
	/** Path to the extracted audio file in Google Cloud Storage */
	audioFilePath: string;
	/** Original MP4 file path */
	originalFilePath: string;
	/** Duration of processing in milliseconds */
	processingTimeMs: number;
}

/**
 * Configuration for audio extraction services
 */
export interface AudioExtractorConfig {
	/** Google Cloud Storage bucket name */
	bucket: string;
	/** Project ID for Google Cloud services */
	projectId?: string;
	/** Region for Google Cloud Transcoder API */
	location?: string;
}

/**
 * Interface for audio extraction services that convert MP4 files to MP3
 */
export interface IAudioExtractorService {
	/**
	 * Extracts audio from an MP4 file stored in Google Cloud Storage
	 * @param gcsFilePath - Path to the MP4 file in GCS (without gs:// prefix)
	 * @param outputFileName - Optional custom output filename (defaults to auto-generated)
	 * @returns Promise with extraction result containing the GCS path to the MP3 file
	 */
	extractAudio(gcsFilePath: string, outputFileName?: string): Promise<AudioExtractionResult>;
}

/**
 * Local FFmpeg implementation that downloads the file and processes it locally
 * Best for: Development, smaller files, when you have FFmpeg installed locally
 */
export class LocalFFmpegExtractor implements IAudioExtractorService {
	private storage: Storage;
	private config: AudioExtractorConfig;

	constructor(config: AudioExtractorConfig) {
		this.config = config;
		this.storage = new Storage();
	}

	async extractAudio(gcsFilePath: string, outputFileName?: string): Promise<AudioExtractionResult> {
		const startTime = Date.now();

		// Generate output filename if not provided
		const inputFileName = gcsFilePath.split("/").pop() || "unknown";
		const baseName = inputFileName.replace(/\.(mp4|mov|avi)$/i, "");
		const finalOutputFileName = outputFileName || `${baseName}_audio_${randomUUID().slice(0, 8)}.mp3`;

		// Create output path with tenant prefix
		const outputPath = getTenantPrefixedPath(`audio/${finalOutputFileName}`);

		// Download the input file as a stream
		const inputFile = this.storage.bucket(this.config.bucket).file(gcsFilePath);
		const [exists] = await inputFile.exists();

		if (!exists) {
			throw new Error(`Input file not found: ${gcsFilePath}`);
		}

		// Create download stream
		const downloadStream = inputFile.createReadStream();

		// Create upload stream for output
		const outputFile = this.storage.bucket(this.config.bucket).file(outputPath);
		const uploadStream = outputFile.createWriteStream({
			metadata: {
				contentType: "audio/mpeg",
			},
		});

		return new Promise((resolve, reject) => {
			// Spawn FFmpeg process
			// -i pipe:0 = read from stdin
			// -vn = no video
			// -acodec copy = copy audio stream without re-encoding (preserves quality)
			// -f mp3 = output format
			// pipe:1 = write to stdout
			const ffmpegProcess = spawn(
				"ffmpeg",
				[
					"-i",
					"pipe:0", // Input from stdin
					"-vn", // No video
					"-acodec",
					"copy", // Copy audio without re-encoding
					"-f",
					"mp3", // Output format
					"pipe:1", // Output to stdout
				],
				{
					stdio: ["pipe", "pipe", "pipe"],
				},
			);

			let errorOutput = "";

			// Handle stderr for error logging
			ffmpegProcess.stderr.on("data", (data) => {
				errorOutput += data.toString();
			});

			// Handle process errors
			ffmpegProcess.on("error", (err) => {
				reject(new Error(`FFmpeg process error: ${err.message}`));
			});

			// Handle process exit
			ffmpegProcess.on("close", (code) => {
				if (code !== 0) {
					reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput}`));
				} else {
					const processingTimeMs = Date.now() - startTime;
					resolve({
						audioFilePath: outputPath,
						originalFilePath: gcsFilePath,
						processingTimeMs,
					});
				}
			});

			// Set up the pipeline: GCS download -> FFmpeg -> GCS upload
			pipeline(downloadStream, ffmpegProcess.stdin).catch(reject);

			pipeline(ffmpegProcess.stdout, uploadStream).catch(reject);
		});
	}
}

/**
 * Google Cloud Transcoder implementation that processes files directly in the cloud
 * Best for: Production, larger files, when running in Google Cloud environment
 */
export class GoogleCloudTranscoderExtractor implements IAudioExtractorService {
	private transcoderClient: TranscoderServiceClient;
	private storage: Storage;
	private config: AudioExtractorConfig;

	constructor(config: AudioExtractorConfig) {
		this.config = config;
		this.transcoderClient = new TranscoderServiceClient();
		this.storage = new Storage();
	}

	async extractAudio(gcsFilePath: string, outputFileName?: string): Promise<AudioExtractionResult> {
		const startTime = Date.now();

		// Generate output filename if not provided
		const inputFileName = gcsFilePath.split("/").pop() || "unknown";
		const baseName = inputFileName.replace(/\.(mp4|mov|avi)$/i, "");
		const finalOutputFileName = outputFileName || `${baseName}_audio_${randomUUID().slice(0, 8)}.mp3`;

		// Create output path with tenant prefix
		const outputPath = getTenantPrefixedPath(`audio/${finalOutputFileName}`);

		const projectId = this.config.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID;
		const location = this.config.location || "us-central1";

		if (!projectId) {
			throw new Error("Project ID is required for Google Cloud Transcoder");
		}

		// Verify input file exists
		const inputFile = this.storage.bucket(this.config.bucket).file(gcsFilePath);
		const [exists] = await inputFile.exists();

		if (!exists) {
			throw new Error(`Input file not found: ${gcsFilePath}`);
		}

		// Create transcoding job configuration
		const outputDir = outputPath.split("/").slice(0, -1).join("/");

		const request = {
			parent: this.transcoderClient.locationPath(projectId, location),
			job: {
				inputUri: `gs://${this.config.bucket}/${gcsFilePath}`,
				outputUri: `gs://${this.config.bucket}/${outputDir}/`,
				config: {
					elementaryStreams: [
						{
							key: "audio-stream0",
							audioStream: {
								codec: "mp3", // Use MP3 codec directly
								bitrateBps: 320000, // High bitrate to preserve quality
								sampleRateHertz: 48000,
								channelCount: 2,
							},
						},
					],
					muxStreams: [
						{
							key: "mp3-audio",
							container: "mp3",
							elementaryStreams: ["audio-stream0"],
							fileName: finalOutputFileName,
						},
					],
				},
			},
		};

		try {
			// Create the transcoding job
			const [operation] = await this.transcoderClient.createJob(request);

			// Wait for the job to complete
			const job = await operation;

			if (job.state === "SUCCEEDED") {
				const processingTimeMs = Date.now() - startTime;
				return {
					audioFilePath: outputPath,
					originalFilePath: gcsFilePath,
					processingTimeMs,
				};
			} else {
				throw new Error(`Transcoding job failed with state: ${job.state}`);
			}
		} catch (error) {
			throw new Error(`Google Cloud Transcoder error: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}
}

/**
 * Factory function to create an audio extractor service
 * @param type - Type of extractor to create
 * @param config - Configuration for the service
 * @returns Configured audio extractor service
 */
export function createAudioExtractor(type: "local" | "gcp", config: AudioExtractorConfig): IAudioExtractorService {
	switch (type) {
		case "local":
			return new LocalFFmpegExtractor(config);
		case "gcp":
			return new GoogleCloudTranscoderExtractor(config);
		default:
			throw new Error(`Unknown audio extractor type: ${type}`);
	}
}
