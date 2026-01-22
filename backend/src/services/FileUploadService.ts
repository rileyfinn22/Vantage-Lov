import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { getTenantPrefixedPath } from "#/lib/tenant";
import { logger } from "#/lib/logger";

export interface PresignedUrlResult {
	presignedUrl: string;
	filePath: string;
	fileName: string;
}

/**
 * Interface for file upload services
 */
export interface IFileUploadService {
	/**
	 * Generates a presigned URL for uploading a new file
	 * @param fileName - Original file name
	 * @param contentType - MIME type of the file
	 * @returns Promise with presigned URL and file path
	 */
	getPresignedUrlForNewUpload(fileName: string, contentType: string): Promise<PresignedUrlResult>;

	/**
	 * Validates that a file upload was completed successfully
	 * @param filePath - Path to the uploaded file
	 * @returns Promise<boolean> indicating if upload is valid
	 */
	validateUpload(filePath: string): Promise<boolean>;

	/**
	 * Generates a public read URL for an uploaded file
	 * @param filePath - Path to the file
	 * @returns Public URL string
	 */
	getPublicUrl(filePath: string): string;

	/**
	 * Generates a presigned URL for downloading a file
	 * @param filePath - Path to the file to download
	 * @param expiresInSeconds - Optional custom expiration time
	 * @returns Promise with presigned download URL
	 */
	getDownloadUrl(filePath: string, expiresInSeconds?: number): Promise<string>;
}

/**
 * Base configuration interface for file upload services
 */
export interface FileUploadConfig {
	bucket: string;
	expiresIn?: number; // seconds, default 900 (15 minutes)
}

/**
 * Google Cloud Storage configuration
 */
export interface GoogleCloudStorageConfig extends FileUploadConfig {
	projectId: string;
	keyFilename?: string; // Path to service account key file
	credentials?: object; // Service account credentials object
}

/**
 * Google Cloud Storage implementation of file upload service
 */
export class GoogleCloudStorage implements IFileUploadService {
	private config: GoogleCloudStorageConfig;
	private storage: Storage;

	constructor(config: GoogleCloudStorageConfig) {
		this.config = {
			expiresIn: 900, // 15 minutes default
			...config,
		};

		// Initialize Google Cloud Storage client
		const storageOptions: any = {
			projectId: this.config.projectId,
		};

		if (this.config.keyFilename) {
			storageOptions.keyFilename = this.config.keyFilename;
		} else if (this.config.credentials) {
			storageOptions.credentials = this.config.credentials;
		}

		this.storage = new Storage(storageOptions);
	}

	async getPresignedUrlForNewUpload(fileName: string, contentType: string): Promise<PresignedUrlResult> {
		// Generate unique file path
		const fileExtension = this.getFileExtension(fileName);
		const uniqueFileName = `${randomUUID()}${fileExtension}`;
		const baseFilePath = `uploads/${new Date().getFullYear()}/${(new Date().getMonth() + 1).toString().padStart(2, "0")}/${uniqueFileName}`;

		// Add tenant prefix to organize files by server instance
		const filePath = getTenantPrefixedPath(baseFilePath);

		const presignedUrl = await this.generateGCSPresignedUrl(filePath, contentType);

		return {
			presignedUrl,
			filePath,
			fileName: uniqueFileName,
		};
	}

	private async generateGCSPresignedUrl(filePath: string, contentType: string): Promise<string> {
		// In development/test without credentials, return mock URL immediately
		if (
			(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
			!this.config.keyFilename &&
			!this.config.credentials
		) {
			logger.info("Using mock presigned URL for development");
			const expires = Date.now() + 15 * 60 * 1000; // 15 minutes
			return `https://storage.googleapis.com/${this.config.bucket}/${filePath}?mock=true&expires=${expires}&contentType=${encodeURIComponent(contentType)}`;
		}

		try {
			const bucket = this.storage.bucket(this.config.bucket);
			const file = bucket.file(filePath);

			// Generate presigned URL for upload
			const [signedUrl] = await file.getSignedUrl({
				version: "v4",
				action: "write",
				expires: Date.now() + this.config.expiresIn! * 1000,
				contentType,
			});

			return signedUrl;
		} catch (error) {
			logger.error({ error }, "Error generating GCS presigned URL");

			// Fallback for development/testing
			if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
				const expires = Date.now() + 15 * 60 * 1000; // 15 minutes
				return `https://storage.googleapis.com/${this.config.bucket}/${filePath}?mock=true&expires=${expires}&contentType=${encodeURIComponent(contentType)}`;
			}

			throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	async validateUpload(filePath: string): Promise<boolean> {
		try {
			const bucket = this.storage.bucket(this.config.bucket);
			const file = bucket.file(filePath);

			// Check if file exists
			const [exists] = await file.exists();
			return exists;
		} catch (error) {
			logger.error({ error }, "Error validating file upload");

			// In development/test, assume validation passes
			if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
				return true;
			}

			return false;
		}
	}

	getPublicUrl(filePath: string): string {
		return `https://storage.googleapis.com/${this.config.bucket}/${filePath}`;
	}

	async getDownloadUrl(filePath: string, expiresInSeconds?: number): Promise<string> {
		// In development/test without credentials, return mock URL immediately
		if (
			(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
			!this.config.keyFilename &&
			!this.config.credentials
		) {
			logger.info("Using mock download URL for development");
			const expires = Date.now() + (expiresInSeconds ?? this.config.expiresIn!) * 1000;
			return `https://storage.googleapis.com/${this.config.bucket}/${filePath}?mock=download&expires=${expires}`;
		}

		try {
			const bucket = this.storage.bucket(this.config.bucket);
			const file = bucket.file(filePath);

			// Use custom expiration time or default
			const expires = Date.now() + (expiresInSeconds ?? this.config.expiresIn!) * 1000;

			// Generate presigned URL for download
			const [signedUrl] = await file.getSignedUrl({
				version: "v4",
				action: "read",
				expires,
			});

			return signedUrl;
		} catch (error) {
			logger.error({ error }, "Error generating GCS download URL");

			// Fallback for development/testing
			if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
				const expires = Date.now() + (expiresInSeconds ?? this.config.expiresIn!) * 1000;
				return `https://storage.googleapis.com/${this.config.bucket}/${filePath}?mock=download&expires=${expires}`;
			}

			throw new Error(`Failed to generate download URL: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	private getFileExtension(fileName: string): string {
		const lastDotIndex = fileName.lastIndexOf(".");
		return lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : "";
	}
}

// Create a default Google Cloud Storage instance using environment variables
export const defaultFileUploadService: IFileUploadService = new GoogleCloudStorage({
	bucket: process.env.GCS_BUCKET || "vantage-blob-storage-testing",
	projectId: process.env.GCS_PROJECT_ID || "vantage-471500",
	keyFilename: process.env.GCS_KEY_FILENAME,
	credentials: process.env.GCS_CREDENTIALS ? JSON.parse(Buffer.from(process.env.GCS_CREDENTIALS, "base64").toString()) : undefined,
});
