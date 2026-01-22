import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { defaultFileUploadService } from "#/services/FileUploadService";
import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq } from "drizzle-orm";
import { checkInteractionAccess, requireFileAccess, getSalespersonForUserWithAdminFallback } from "#/middleware/authorization";
import { logger } from "#/lib/logger";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { getTenantPrefixedPath } from "#/lib/tenant";
import { fileURLToPath } from "node:url";
import { idParamSchema } from "#/lib/validation";
import { FILE_LIMITS } from "#/config";

// Get the backend directory (works whether running from root or backend dir)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Navigate from src/api/upload to backend root
const backendDir = join(__dirname, "..", "..", "..");

function getUploadsDir() {
	// First try the directory relative to the backend folder
	const backendUploads = join(backendDir, "uploads");
	if (existsSync(backendUploads)) {
		return backendUploads;
	}
	// Fall back to process.cwd() for backwards compatibility
	return join(process.cwd(), "uploads");
}

// Validation schemas
const presignedUrlRequestSchema = z.object({
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	interactionId: z.number().int().positive().optional(),
});

const uploadCompleteSchema = z.object({
	filePath: z.string().min(1),
	fileName: z.string().min(1),
	fileSize: z.number().int().positive().optional(),
	interactionId: z.number().int().positive().optional(),
});

const app = new Hono<AuthVariable<false>>()
	.use("*", async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		return next();
	})
	.post("/local", async (c) => {
		try {
			const currentUser = c.get("user");
			if (!currentUser) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Parse multipart form data
			const body = await c.req.parseBody();
			const file = body.file as File;
			const interactionId = body.interactionId ? Number(body.interactionId) : undefined;

			if (!file) {
				return c.json({ error: "No file provided" }, 400);
			}

			// Validate file size
			const isVideo = file.type?.startsWith("video/") || file.name.match(/\.(mp4|mov|avi|mkv|webm)$/i);
			const maxSize = isVideo ? FILE_LIMITS.MAX_VIDEO_SIZE_BYTES : FILE_LIMITS.MAX_AUDIO_SIZE_BYTES;
			if (file.size > maxSize) {
				const maxSizeMB = Math.floor(maxSize / (1024 * 1024));
				return c.json({ error: `File size must be less than ${maxSizeMB}MB` }, 400);
			}

			// Validate interaction access
			if (interactionId) {
				const hasAccess = await checkInteractionAccess(currentUser.id, interactionId);
				if (!hasAccess) {
					return c.json({ error: "Forbidden: No access to this interaction" }, 403);
				}

				const interaction = await db.select().from(schema.interactions).where(eq(schema.interactions.id, interactionId)).limit(1);

				if (interaction.length === 0) {
					return c.json({ error: "Interaction not found" }, 404);
				}
			}

			// Generate unique file path
			const fileExtension = file.name.substring(file.name.lastIndexOf("."));
			const uniqueFileName = `${randomUUID()}${fileExtension}`;
			const baseFilePath = `uploads/${new Date().getFullYear()}/${(new Date().getMonth() + 1).toString().padStart(2, "0")}/${uniqueFileName}`;
			const filePath = getTenantPrefixedPath(baseFilePath);

			// Create upload directory if it doesn't exist
			const uploadsBase = getUploadsDir();
			const uploadDir = join(uploadsBase, filePath.split("/").slice(0, -1).join("/"));
			if (!existsSync(uploadDir)) {
				await mkdir(uploadDir, { recursive: true });
			}

			// Save file to local filesystem
			const fullPath = join(uploadsBase, filePath);
			const arrayBuffer = await file.arrayBuffer();
			await writeFile(fullPath, Buffer.from(arrayBuffer));

			// Determine MIME type
			const mimeType = file.type || getMimeTypeFromPath(file.name);

			// If no interactionId provided, create a new interaction for the user's salesperson
			let finalInteractionId = interactionId;
			if (!finalInteractionId) {
				const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);
				if (!salespersonResult) {
					return c.json({ error: "No salesperson found for user. Please ensure you have a salesperson profile." }, 400);
				}

				// Create a new interaction
				const [newInteraction] = await db
					.insert(schema.interactions)
					.values({
						salespersonId: salespersonResult.salesperson.id,
						processedStatus: "unprocessed",
						blurb: `Call uploaded: ${file.name}`,
					})
					.returning();

				finalInteractionId = newInteraction.id;
				logger.info(
					{ interactionId: finalInteractionId, salespersonId: salespersonResult.salesperson.id, fileName: file.name },
					"Created new interaction for uploaded file",
				);
			}

			// Store file record in database
			const fileRecord = await db
				.insert(schema.bigfiles)
				.values({
					fileName: file.name,
					filePath,
					fileSize: file.size,
					mimeType,
					interactionId: finalInteractionId,
				})
				.returning();

			logger.info({ filePath, fileSize: file.size, interactionId: finalInteractionId }, "File uploaded locally");

			return c.json({
				success: true,
				fileId: fileRecord[0].id,
				interactionId: finalInteractionId,
				filePath,
				fileName: uniqueFileName,
			});
		} catch (error) {
			logger.error({ error }, "Error uploading file locally");
			return c.json({ error: "Failed to upload file" }, 500);
		}
	})
	.post("/presigned-url", zValidator("json", presignedUrlRequestSchema), async (c) => {
		try {
			const currentUser = c.get("user");
			if (!currentUser) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			const { fileName, contentType, interactionId } = c.req.valid("json");

			// Validate that user has access to the interaction if provided
			if (interactionId) {
				const hasAccess = await checkInteractionAccess(currentUser.id, interactionId);
				if (!hasAccess) {
					return c.json({ error: "Forbidden: No access to this interaction" }, 403);
				}

				const interaction = await db.select().from(schema.interactions).where(eq(schema.interactions.id, interactionId)).limit(1);

				if (interaction.length === 0) {
					return c.json({ error: "Interaction not found" }, 404);
				}
			}

			const result = await defaultFileUploadService.getPresignedUrlForNewUpload(fileName, contentType);

			return c.json({
				presignedUrl: result.presignedUrl,
				filePath: result.filePath,
				fileName: result.fileName,
			});
		} catch (error) {
			logger.error({ error }, "Error generating presigned URL");
			return c.json({ error: "Failed to generate presigned URL" }, 500);
		}
	})
	.post("/complete", zValidator("json", uploadCompleteSchema), async (c) => {
		try {
			const { filePath, fileName, fileSize, interactionId } = c.req.valid("json");

			// Validate that the upload was successful
			const isValid = await defaultFileUploadService.validateUpload(filePath);
			if (!isValid) {
				return c.json({ error: "Upload validation failed" }, 400);
			}

			// Determine MIME type from file extension
			const mimeType = getMimeTypeFromPath(filePath);

			// Store file record in database
			const fileRecord = await db
				.insert(schema.bigfiles)
				.values({
					fileName,
					filePath,
					fileSize,
					mimeType,
					interactionId,
				})
				.returning();

			return c.json({
				success: true,
				fileId: fileRecord[0].id,
				publicUrl: defaultFileUploadService.getPublicUrl(filePath),
			});
		} catch (error) {
			logger.error({ error }, "Error completing upload");
			return c.json({ error: "Failed to complete upload" }, 500);
		}
	})
	.get("/files/:id", zValidator("param", idParamSchema), requireFileAccess("id"), async (c) => {
		try {
			const fileId = c.req.valid("param").id;

			const file = await db.select().from(schema.bigfiles).where(eq(schema.bigfiles.id, fileId)).limit(1);

			if (file.length === 0) {
				return c.json({ error: "File not found" }, 404);
			}

			return c.json({
				...file[0],
				publicUrl: defaultFileUploadService.getPublicUrl(file[0].filePath),
			});
		} catch (error) {
			logger.error({ error }, "Error fetching file");
			return c.json({ error: "Failed to fetch file" }, 500);
		}
	})
	.get("/download/:id", zValidator("param", idParamSchema), requireFileAccess("id"), async (c) => {
		try {
			const fileId = c.req.valid("param").id;

			const file = await db.select().from(schema.bigfiles).where(eq(schema.bigfiles.id, fileId)).limit(1);

			if (file.length === 0) {
				return c.json({ error: "File not found" }, 404);
			}

			// In development, check if file exists locally first
			if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
				const uploadsDir = getUploadsDir();
				const localPath = join(uploadsDir, file[0].filePath);
				const fileExists = existsSync(localPath);
				logger.info({ uploadsDir, filePath: file[0].filePath, localPath, fileExists }, "Checking for local file");
				if (fileExists) {
					// Return local download URL
					return c.json({
						downloadUrl: `/vantage/api/upload/local-file/${fileId}`,
						fileName: file[0].fileName,
						mimeType: file[0].mimeType,
						fileSize: file[0].fileSize,
					});
				}
			}

			// Generate presigned download URL for GCS
			const downloadUrl = await defaultFileUploadService.getDownloadUrl(file[0].filePath);

			return c.json({
				downloadUrl,
				fileName: file[0].fileName,
				mimeType: file[0].mimeType,
				fileSize: file[0].fileSize,
			});
		} catch (error) {
			logger.error({ error }, "Error generating download URL");
			return c.json({ error: "Failed to generate download URL" }, 500);
		}
	})
	.get("/local-file/:id", zValidator("param", idParamSchema), requireFileAccess("id"), async (c) => {
		try {
			const fileId = c.req.valid("param").id;

			const file = await db.select().from(schema.bigfiles).where(eq(schema.bigfiles.id, fileId)).limit(1);

			if (file.length === 0) {
				return c.json({ error: "File not found" }, 404);
			}

			// Serve local file
			const localPath = join(getUploadsDir(), file[0].filePath);
			if (!existsSync(localPath)) {
				return c.json({ error: "File not found on disk" }, 404);
			}

			const { readFile } = await import("node:fs/promises");
			const fileBuffer = await readFile(localPath);

			const mimeType = file[0].mimeType ?? "application/octet-stream";
			const isMediaFile = mimeType.startsWith("audio/") || mimeType.startsWith("video/");

			c.header("Content-Type", mimeType);
			// Use inline for media files to allow streaming/playback, attachment for downloads
			c.header("Content-Disposition", `${isMediaFile ? "inline" : "attachment"}; filename="${file[0].fileName}"`);
			c.header("Content-Length", file[0].fileSize?.toString() ?? fileBuffer.length.toString());
			// Enable range requests for media seeking
			c.header("Accept-Ranges", "bytes");

			return c.body(fileBuffer);
		} catch (error) {
			logger.error({ error }, "Error serving local file");
			return c.json({ error: "Failed to serve file" }, 500);
		}
	});

// Helper function to determine MIME type from file path
function getMimeTypeFromPath(filePath: string): string {
	const extension = filePath.split(".").pop()?.toLowerCase();

	const mimeTypes: Record<string, string> = {
		pdf: "application/pdf",
		doc: "application/msword",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		xls: "application/vnd.ms-excel",
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		ppt: "application/vnd.ms-powerpoint",
		pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		mp3: "audio/mpeg",
		mp4: "video/mp4",
		mov: "video/quicktime",
		avi: "video/x-msvideo",
		mkv: "video/x-matroska",
		webm: "video/webm",
		flv: "video/x-flv",
		wmv: "video/x-ms-wmv",
		m4v: "video/x-m4v",
		wav: "audio/wav",
		m4a: "audio/mp4",
		aac: "audio/aac",
		txt: "text/plain",
		csv: "text/csv",
	};

	return mimeTypes[extension || ""] || "application/octet-stream";
}

export default app;
export type UploadRoutes = typeof app;
