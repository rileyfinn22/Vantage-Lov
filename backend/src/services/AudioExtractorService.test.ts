import { describe, it, expect, vi, beforeEach } from "vitest";
import { Storage } from "@google-cloud/storage";
import { TranscoderServiceClient } from "@google-cloud/video-transcoder";
import { spawn } from "node:child_process";
import {
	LocalFFmpegExtractor,
	GoogleCloudTranscoderExtractor,
	createAudioExtractor,
	type AudioExtractorConfig,
} from "./AudioExtractorService";

// Mock dependencies
vi.mock("@google-cloud/storage");
vi.mock("@google-cloud/video-transcoder");
vi.mock("child_process");
vi.mock("#/lib/tenant", () => ({
	getTenantPrefixedPath: vi.fn((path: string) => `tenant/prefix/${path}`),
}));

const mockConfig: AudioExtractorConfig = {
	bucket: "test-bucket",
	projectId: "test-project",
	location: "us-central1",
};

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)("AudioExtractorService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("createAudioExtractor", () => {
		it('should create LocalFFmpegExtractor for "local" type', () => {
			const extractor = createAudioExtractor("local", mockConfig);
			expect(extractor).toBeInstanceOf(LocalFFmpegExtractor);
		});

		it('should create GoogleCloudTranscoderExtractor for "gcp" type', () => {
			const extractor = createAudioExtractor("gcp", mockConfig);
			expect(extractor).toBeInstanceOf(GoogleCloudTranscoderExtractor);
		});

		it("should throw error for unknown type", () => {
			expect(() => createAudioExtractor("unknown" as any, mockConfig)).toThrow("Unknown audio extractor type: unknown");
		});
	});

	describe("LocalFFmpegExtractor", () => {
		let extractor: LocalFFmpegExtractor;
		let mockStorage: any;
		let mockFile: any;
		let mockBucket: any;

		beforeEach(() => {
			mockFile = {
				exists: vi.fn().mockResolvedValue([true]),
				createReadStream: vi.fn(),
				createWriteStream: vi.fn(),
			};

			mockBucket = {
				file: vi.fn().mockReturnValue(mockFile),
			};

			mockStorage = {
				bucket: vi.fn().mockReturnValue(mockBucket),
			};

			(Storage as any).mockImplementation(() => mockStorage);

			extractor = new LocalFFmpegExtractor(mockConfig);
		});

		it("should throw error if input file does not exist", async () => {
			mockFile.exists.mockResolvedValue([false]);

			await expect(extractor.extractAudio("test/video.mp4")).rejects.toThrow("Input file not found: test/video.mp4");
		});

		it("should generate output filename if not provided", async () => {
			// Mock streams
			const mockReadStream = { pipe: vi.fn() };
			const mockWriteStream = { write: vi.fn(), end: vi.fn() };
			mockFile.createReadStream.mockReturnValue(mockReadStream);
			mockFile.createWriteStream.mockReturnValue(mockWriteStream);

			// Mock ffmpeg process
			const mockProcess = {
				stdin: mockWriteStream,
				stdout: mockReadStream,
				stderr: { on: vi.fn() },
				on: vi.fn((event, callback) => {
					if (event === "close") {
						// Simulate successful completion
						setTimeout(() => callback(0), 10);
					}
				}),
			};

			vi.mocked(spawn).mockReturnValue(mockProcess as any);

			// Mock pipeline to resolve immediately
			vi.doMock("stream/promises", () => ({
				pipeline: vi.fn().mockResolvedValue(undefined),
			}));

			const result = await extractor.extractAudio("test/video.mp4");

			expect(result.originalFilePath).toBe("test/video.mp4");
			expect(result.audioFilePath).toContain("tenant/prefix/audio/video_audio_");
			expect(result.audioFilePath).toMatch(/\.mp3$/);
			expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
		});

		it("should use custom output filename when provided", async () => {
			// Mock streams
			const mockReadStream = { pipe: vi.fn() };
			const mockWriteStream = { write: vi.fn(), end: vi.fn() };
			mockFile.createReadStream.mockReturnValue(mockReadStream);
			mockFile.createWriteStream.mockReturnValue(mockWriteStream);

			// Mock ffmpeg process
			const mockProcess = {
				stdin: mockWriteStream,
				stdout: mockReadStream,
				stderr: { on: vi.fn() },
				on: vi.fn((event, callback) => {
					if (event === "close") {
						setTimeout(() => callback(0), 10);
					}
				}),
			};

			vi.mocked(spawn).mockReturnValue(mockProcess as any);

			vi.doMock("stream/promises", () => ({
				pipeline: vi.fn().mockResolvedValue(undefined),
			}));

			const result = await extractor.extractAudio("test/video.mp4", "custom_audio.mp3");

			expect(result.audioFilePath).toBe("tenant/prefix/audio/custom_audio.mp3");
		});
	});

	describe("GoogleCloudTranscoderExtractor", () => {
		let extractor: GoogleCloudTranscoderExtractor;
		let mockTranscoderClient: any;
		let mockStorage: any;
		let mockFile: any;
		let mockBucket: any;

		beforeEach(() => {
			mockFile = {
				exists: vi.fn().mockResolvedValue([true]),
			};

			mockBucket = {
				file: vi.fn().mockReturnValue(mockFile),
			};

			mockStorage = {
				bucket: vi.fn().mockReturnValue(mockBucket),
			};

			mockTranscoderClient = {
				locationPath: vi.fn().mockReturnValue("projects/test-project/locations/us-central1"),
				createJob: vi.fn(),
			};

			(Storage as any).mockImplementation(() => mockStorage);
			(TranscoderServiceClient as any).mockImplementation(() => mockTranscoderClient);

			extractor = new GoogleCloudTranscoderExtractor(mockConfig);
		});

		it("should throw error if project ID is not provided", async () => {
			const configWithoutProject = { bucket: "test-bucket" };
			const extractorWithoutProject = new GoogleCloudTranscoderExtractor(configWithoutProject);

			await expect(extractorWithoutProject.extractAudio("test/video.mp4")).rejects.toThrow(
				"Project ID is required for Google Cloud Transcoder",
			);
		});

		it("should throw error if input file does not exist", async () => {
			mockFile.exists.mockResolvedValue([false]);

			await expect(extractor.extractAudio("test/video.mp4")).rejects.toThrow("Input file not found: test/video.mp4");
		});

		it("should create transcoding job with correct configuration", async () => {
			const mockOperation = {
				promise: vi.fn().mockResolvedValue([{ state: "SUCCEEDED" }]),
			};
			mockTranscoderClient.createJob.mockResolvedValue([mockOperation]);

			const result = await extractor.extractAudio("test/video.mp4");

			expect(mockTranscoderClient.createJob).toHaveBeenCalledWith({
				parent: "projects/test-project/locations/us-central1",
				job: {
					inputUri: "gs://test-bucket/test/video.mp4",
					outputUri: "gs://test-bucket/tenant/prefix/",
					config: {
						elementaryStreams: [
							{
								key: "audio-stream0",
								audioStream: {
									codec: "mp3",
									bitrateBps: 320000,
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
								fileName: expect.stringMatching(/video_audio_.*\.mp3$/),
							},
						],
					},
				},
			});

			expect(result.originalFilePath).toBe("test/video.mp4");
			expect(result.audioFilePath).toContain("tenant/prefix/audio/video_audio_");
			expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
		});

		it("should throw error if transcoding job fails", async () => {
			const mockOperation = {
				promise: vi.fn().mockResolvedValue([{ state: "FAILED" }]),
			};
			mockTranscoderClient.createJob.mockResolvedValue([mockOperation]);

			await expect(extractor.extractAudio("test/video.mp4")).rejects.toThrow("Transcoding job failed with state: FAILED");
		});

		it("should handle transcoder API errors", async () => {
			mockTranscoderClient.createJob.mockRejectedValue(new Error("API Error"));

			await expect(extractor.extractAudio("test/video.mp4")).rejects.toThrow("Google Cloud Transcoder error: API Error");
		});
	});
});
