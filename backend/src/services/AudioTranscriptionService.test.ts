import { describe, it, expect, beforeAll } from "vitest";
import { ElevenLabsTranscriber, ElevenLabsApiError, type TranscriptionInput } from "./AudioTranscriptionService";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)("ElevenLabsTranscriber", () => {
	let transcriber: ElevenLabsTranscriber;

	beforeAll(() => {
		// Initialize transcriber with a dummy API key for testing (will use mock mode)
		transcriber = new ElevenLabsTranscriber({
			apiKey: "test-api-key-dummy",
		});
	});

	it("should create a transcriber instance", () => {
		expect(transcriber).toBeDefined();
	});

	it("should return mock transcription for file path input in test mode", async () => {
		const input: TranscriptionInput = {
			type: "filePath",
			filePath: "test/audio/sample.mp3",
		};

		const result = await transcriber.transcribe(input);

		expect(result).toBeDefined();
		expect(result.service).toBe("elevenlabs-mock");
		expect(result.segments).toHaveLength(2);
		expect(result.speakerCount).toBe(2);
	});

	it("should return mock transcription for URL input in test mode", async () => {
		const input: TranscriptionInput = {
			type: "url",
			url: "https://example.com/audio/sample.mp3",
		};

		const result = await transcriber.transcribe(input);

		expect(result).toBeDefined();
		expect(result.service).toBe("elevenlabs-mock");
		expect(result.segments).toHaveLength(2);
		expect(result.speakerCount).toBe(2);
	});

	it("should include speaker IDs in segments", async () => {
		const input: TranscriptionInput = {
			type: "filePath",
			filePath: "test/audio/sample.mp3",
		};

		const result = await transcriber.transcribe(input);

		for (const segment of result.segments) {
			expect(segment.speakerId).toMatch(/^speaker_\d+$/);
			expect(segment.text).toBeDefined();
			expect(segment.startTime).toBeGreaterThanOrEqual(0);
			expect(segment.endTime).toBeGreaterThan(segment.startTime);
			expect(segment.confidence).toBeGreaterThanOrEqual(0);
			expect(segment.confidence).toBeLessThanOrEqual(1);
		}
	});

	it("should calculate duration correctly", async () => {
		const input: TranscriptionInput = {
			type: "filePath",
			filePath: "test/audio/sample.mp3",
		};

		const result = await transcriber.transcribe(input);

		expect(result.durationSeconds).toBeGreaterThan(0);
		expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
	});
});

describe("ElevenLabsApiError", () => {
	it("should create error with correct properties", () => {
		const statusCode = 429;
		const body = { error: "Rate limit exceeded", detail: "Too many requests" };
		const formData = new FormData();
		formData.append("model_id", "scribe_v1");
		formData.append("language_code", "en");

		const error = new ElevenLabsApiError(statusCode, body, formData);

		expect(error.name).toBe("ElevenLabsApiError");
		expect(error.statusCode).toBe(429);
		expect(error.body).toEqual(body);
		expect(error.requestData).toBeDefined();
		expect(error.message).toBe("ElevenLabs API error: 429");
		expect(error).toBeInstanceOf(Error);
	});
});
