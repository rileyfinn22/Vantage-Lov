import { describe, it, expect, beforeAll } from "vitest";
import { GoogleCloudStorage } from "./FileUploadService";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)("FileUploadService Integration Tests", () => {
	let fileUploadService: GoogleCloudStorage;

	beforeAll(() => {
		// Check required environment variables
		if (!process.env.GCS_BUCKET) {
			throw new Error("GCS_BUCKET environment variable is required for integration tests");
		}
		if (!process.env.GCS_PROJECT_ID) {
			throw new Error("GCS_PROJECT_ID environment variable is required for integration tests");
		}
		if (!process.env.GCS_CREDENTIALS && !process.env.GCS_KEY_FILENAME) {
			throw new Error("Either GCS_CREDENTIALS or GCS_KEY_FILENAME environment variable is required for integration tests");
		}

		// Create service instance
		fileUploadService = new GoogleCloudStorage({
			bucket: process.env.GCS_BUCKET,
			projectId: process.env.GCS_PROJECT_ID,
			keyFilename: process.env.GCS_KEY_FILENAME,
			credentials: process.env.GCS_CREDENTIALS ? JSON.parse(Buffer.from(process.env.GCS_CREDENTIALS, "base64").toString()) : undefined,
		});
	});

	it("should generate a valid presigned URL for upload", async () => {
		const fileName = "test-file.txt";
		const contentType = "text/plain";

		const result = await fileUploadService.getPresignedUrlForNewUpload(fileName, contentType);

		expect(result).toBeDefined();
		expect(result.presignedUrl).toBeDefined();
		expect(result.filePath).toBeDefined();
		expect(result.fileName).toBeDefined();
		expect(typeof result.presignedUrl).toBe("string");
		expect(result.presignedUrl).toContain("https://storage.googleapis.com");
		expect(result.filePath).toContain("uploads/");
		expect(result.fileName).toMatch(/^[a-f0-9-]+\.txt$/); // UUID format with extension
	});

	it("should successfully upload a file using presigned URL", async () => {
		const testContent = "Test file content for upload integration test";
		const fileName = "integration-test.txt";
		const contentType = "text/plain";

		// Step 1: Get presigned URL
		const uploadResult = await fileUploadService.getPresignedUrlForNewUpload(fileName, contentType);

		// Step 2: Upload file to GCS using presigned URL
		const uploadResponse = await fetch(uploadResult.presignedUrl, {
			method: "PUT",
			body: testContent,
			headers: {
				"Content-Type": contentType,
				// 'x-goog-content-length-range': String(Buffer.byteLength(testContent)),
			},
		});

		await expect(uploadResponse).toMatchResponse({
			status: 200,
		});

		// Step 3: Validate upload was successful
		const isValid = await fileUploadService.validateUpload(uploadResult.filePath);
		expect(isValid).toBe(true);

		// Step 4: Test download URL generation
		const downloadUrl = await fileUploadService.getDownloadUrl(uploadResult.filePath);
		expect(downloadUrl).toBeDefined();
		expect(typeof downloadUrl).toBe("string");
		expect(downloadUrl).toContain("https://storage.googleapis.com");

		// Step 5: Test public URL generation
		const publicUrl = fileUploadService.getPublicUrl(uploadResult.filePath);
		expect(publicUrl).toBeDefined();
		expect(typeof publicUrl).toBe("string");
		expect(publicUrl).toContain(process.env.GCS_BUCKET!);
		expect(publicUrl).toContain(uploadResult.filePath);
	}, 30000); // 30 second timeout for upload operations

	it("should handle upload validation for non-existent files", async () => {
		const nonExistentPath = "uploads/2024/01/non-existent-file.txt";

		const isValid = await fileUploadService.validateUpload(nonExistentPath);
		expect(isValid).toBe(false);
	});

	it("should generate download URLs with custom expiration", async () => {
		// First upload a file to test download URL generation
		const testContent = "Test file for download URL test";
		const fileName = "download-test.txt";
		const contentType = "text/plain";

		const uploadResult = await fileUploadService.getPresignedUrlForNewUpload(fileName, contentType);

		// Upload the file
		const uploadResponse = await fetch(uploadResult.presignedUrl, {
			method: "PUT",
			body: testContent,
			headers: {
				"Content-Type": contentType,
			},
		});

		expect(uploadResponse.ok).toBe(true);

		// Test download URL with custom expiration (1 hour = 3600 seconds)
		const downloadUrl = await fileUploadService.getDownloadUrl(uploadResult.filePath, 3600);
		expect(downloadUrl).toBeDefined();
		expect(typeof downloadUrl).toBe("string");
		expect(downloadUrl).toContain("https://storage.googleapis.com");
		expect(downloadUrl).toContain("Expires=");
	}, 30000);

	it.skip("should handle errors gracefully with invalid credentials", async () => {
		// Create service with invalid credentials
		const invalidService = new GoogleCloudStorage({
			bucket: "invalid-bucket",
			projectId: "invalid-project",
			credentials: { type: "service_account", client_email: "invalid@test.com" },
		});

		const url = await invalidService.getPresignedUrlForNewUpload("test.txt", "text/plain");
		// This should either throw an error or return a fallback URL in development
		await expect(async () => {
			await fetch(url.presignedUrl, { method: "PUT", body: "data" });
		}).rejects.toThrow();
	});

	it("should handle file extension extraction correctly", async () => {
		const testCases = [
			{ fileName: "document.pdf", expectedExtension: ".pdf" },
			{ fileName: "image.jpeg", expectedExtension: ".jpeg" },
			{ fileName: "file-without-extension", expectedExtension: "" },
			{ fileName: "file.with.multiple.dots.txt", expectedExtension: ".txt" },
		];

		for (const testCase of testCases) {
			const result = await fileUploadService.getPresignedUrlForNewUpload(testCase.fileName, "application/octet-stream");

			if (testCase.expectedExtension) {
				expect(result.fileName).toContain(testCase.expectedExtension);
			} else {
				expect(result.fileName).not.toContain(".");
			}
		}
	});
});
