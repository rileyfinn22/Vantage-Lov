import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { defaultFileUploadService } from "#/services/FileUploadService";
import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq } from "drizzle-orm";
import { checkInteractionAccess, requireFileAccess, getSalespersonForUserWithAdminFallback } from "#/middleware/authorization";
import { logger } from "#/lib/logger";
import { writeFile, mkdir, stat, readdir, unlink, appendFile } from "node:fs/promises";
import { join, dirname, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
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

function getChunksDir() {
	return join(getUploadsDir(), "chunks");
}

// Track active chunk uploads in memory
const activeUploads = new Map<string, { chunks: Set<number>; totalChunks: number; fileName: string; mimeType: string; fileSize: number; interactionId?: number }>();

async function combineChunks(uploadId: string, totalChunks: number, outputPath: string): Promise<void> {
	const chunksDir = getChunksDir();
	const writeStream = createWriteStream(outputPath);

	for (let i = 0; i < totalChunks; i++) {
		const chunkPath = join(chunksDir, `${uploadId}_${i}`);
		const chunkData = createReadStream(chunkPath);

		await new Promise<void>((resolve, reject) => {
			chunkData.pipe(writeStream, { end: false });
			chunkData.on("end", resolve);
			chunkData.on("error", reject);
		});
	}

	writeStream.end();

	// Clean up chunk files
	for (let i = 0; i < totalChunks; i++) {
		const chunkPath = join(chunksDir, `${uploadId}_${i}`);
		await unlink(chunkPath).catch(() => {});
	}
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
	// Chunked upload endpoint - handles 20MB chunks sequentially
	.use("/chunk", bodyLimit({ maxSize: 25 * 1024 * 1024 })) // 25MB limit per chunk
	.post("/chunk", async (c) => {
		try {
			const currentUser = c.get("user");
			if (!currentUser) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			const body = await c.req.parseBody();
			const chunk = body.chunk as File;
			const uploadId = body.uploadId as string;
			const chunkIndex = Number(body.chunkIndex);
			const totalChunks = Number(body.totalChunks);
			const fileName = body.fileName as string;
			const fileSize = Number(body.fileSize);
			const mimeType = body.mimeType as string;
			const interactionId = body.interactionId ? Number(body.interactionId) : undefined;

			if (!chunk || !uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !fileName) {
				return c.json({ error: "Missing required fields" }, 400);
			}

			// Create chunks directory if needed
			const chunksDir = getChunksDir();
			if (!existsSync(chunksDir)) {
				await mkdir(chunksDir, { recursive: true });
			}

			// Save the chunk
			const chunkPath = join(chunksDir, `${uploadId}_${chunkIndex}`);
			const arrayBuffer = await chunk.arrayBuffer();
			await writeFile(chunkPath, Buffer.from(arrayBuffer));

			// Track this upload
			if (!activeUploads.has(uploadId)) {
				activeUploads.set(uploadId, {
					chunks: new Set(),
					totalChunks,
					fileName,
					mimeType,
					fileSize,
					interactionId,
				});
			}

			const upload = activeUploads.get(uploadId)!;
			upload.chunks.add(chunkIndex);

			logger.info({ uploadId, chunkIndex, totalChunks, receivedChunks: upload.chunks.size }, "Chunk received");

			// Check if all chunks are received
			if (upload.chunks.size === totalChunks) {
				// Combine chunks into final file
				const uploadsBase = getUploadsDir();
				const fileExtension = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : ".bin";
				const uniqueFileName = `${randomUUID()}${fileExtension}`;
				const baseFilePath = `uploads/${new Date().getFullYear()}/${(new Date().getMonth() + 1).toString().padStart(2, "0")}/${uniqueFileName}`;
				const filePath = getTenantPrefixedPath(baseFilePath);

				const uploadDir = join(uploadsBase, filePath.split("/").slice(0, -1).join("/"));
				if (!existsSync(uploadDir)) {
					await mkdir(uploadDir, { recursive: true });
				}

				const fullPath = join(uploadsBase, filePath);
				await combineChunks(uploadId, totalChunks, fullPath);

				// Create interaction if needed
				let finalInteractionId = interactionId;
				if (!finalInteractionId) {
					const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);
					if (!salespersonResult) {
						return c.json({ error: "No salesperson found for user" }, 400);
					}

					const [newInteraction] = await db
						.insert(schema.interactions)
						.values({
							salespersonId: salespersonResult.salesperson.id,
							processedStatus: "unprocessed",
							blurb: `Call uploaded: ${fileName}`,
						})
						.returning();

					finalInteractionId = newInteraction.id;
				}

				// Store file record
				const fileRecord = await db
					.insert(schema.bigfiles)
					.values({
						fileName,
						filePath,
						fileSize,
						mimeType,
						interactionId: finalInteractionId,
					})
					.returning();

				// Clean up tracking
				activeUploads.delete(uploadId);

				logger.info({ uploadId, filePath, fileSize, interactionId: finalInteractionId }, "Chunked upload complete");

				return c.json({
					success: true,
					complete: true,
					fileId: fileRecord[0].id,
					interactionId: finalInteractionId,
					filePath,
				});
			}

			return c.json({
				success: true,
				complete: false,
				chunksReceived: upload.chunks.size,
				totalChunks,
			});
		} catch (error) {
			logger.error({ error }, "Error processing chunk upload");
			return c.json({ error: "Failed to process chunk" }, 500);
		}
	})
	// Allow 2GB file uploads
	.use("/local", bodyLimit({ maxSize: FILE_LIMITS.MAX_VIDEO_SIZE_BYTES }))
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
				const maxSizeGB = maxSize / (1024 * 1024 * 1024);
				return c.json({ error: `File size must be less than ${maxSizeGB}GB` }, 400);
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

			// Generate unique file path - handle missing extension from Windows browsers
			let fileExtension = "";
			const lastDotIndex = file.name.lastIndexOf(".");
			if (lastDotIndex > 0) {
				fileExtension = file.name.substring(lastDotIndex);
			} else {
				// Fall back to extension from MIME type if filename has no extension
				const mimeToExt: Record<string, string> = {
					"audio/mpeg": ".mp3",
					"audio/mp3": ".mp3",
					"audio/wav": ".wav",
					"audio/wave": ".wav",
					"audio/x-wav": ".wav",
					"audio/m4a": ".m4a",
					"audio/x-m4a": ".m4a",
					"audio/aac": ".aac",
					"video/mp4": ".mp4",
					"video/quicktime": ".mov",
					"video/x-msvideo": ".avi",
					"video/x-matroska": ".mkv",
					"video/webm": ".webm",
				};
				fileExtension = mimeToExt[file.type] ?? ".bin";
				logger.warn({ fileName: file.name, mimeType: file.type, inferredExtension: fileExtension }, "No file extension found, inferring from MIME type");
			}
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

			// Check if file exists locally first (uploads via /local endpoint), fall back to GCS
			const uploadsDir = getUploadsDir();
			const localPath = isAbsolute(file[0].filePath) ? file[0].filePath : join(uploadsDir, file[0].filePath);
			if (existsSync(localPath)) {
				return c.json({
					downloadUrl: `/vantage/api/upload/local-file/${fileId}`,
					fileName: file[0].fileName,
					mimeType: file[0].mimeType,
					fileSize: file[0].fileSize,
				});
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

			const localPath = isAbsolute(file[0].filePath) ? file[0].filePath : join(getUploadsDir(), file[0].filePath);
			if (!existsSync(localPath)) {
				return c.json({ error: "File not found on disk" }, 404);
			}

			const fileStat = await stat(localPath);
			const fileSize = fileStat.size;
			const mimeType = file[0].mimeType ?? "application/octet-stream";
			const isMediaFile = mimeType.startsWith("audio/") || mimeType.startsWith("video/");

			// Handle Range requests for video/audio seeking
			const rangeHeader = c.req.header("Range");
			if (rangeHeader && isMediaFile) {
				const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
				if (match) {
					const start = match[1] ? Number.parseInt(match[1]) : 0;
					const end = match[2] ? Number.parseInt(match[2]) : fileSize - 1;
					const chunkSize = end - start + 1;

					const nodeStream = createReadStream(localPath, { start, end });
					const webStream = Readable.toWeb(nodeStream) as ReadableStream;

					c.header("Content-Type", mimeType);
					c.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
					c.header("Content-Length", chunkSize.toString());
					c.header("Accept-Ranges", "bytes");

					return c.body(webStream, { status: 206 });
				}
			}

			// Full file stream
			const nodeStream = createReadStream(localPath);
			const webStream = Readable.toWeb(nodeStream) as ReadableStream;

			c.header("Content-Type", mimeType);
			c.header("Content-Disposition", `${isMediaFile ? "inline" : "attachment"}; filename="${file[0].fileName}"`);
			c.header("Content-Length", fileSize.toString());
			c.header("Accept-Ranges", "bytes");

			return c.body(webStream);
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
