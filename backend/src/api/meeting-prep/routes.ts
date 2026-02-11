import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "#/data";
import { meetingPreps } from "#/data/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSalespersonForUserWithAdminFallback, getUserCompanyId } from "#/middleware/authorization";
import { requireAuth } from "#/middleware/auth";
import { logger } from "#/lib/logger";
import { MeetingPrepService } from "#/services/MeetingPrepService";
import elevenlabsConversational from "#/vantage/elevenlabsConversational";
import { streamSSE } from "hono/streaming";

// Validation schemas
const createPrepSchema = z.object({
	prospectCompany: z.string().min(1, "Company name is required"),
	prospectContactName: z.string().optional(),
	prospectContactRole: z.string().optional(),
	prospectIndustry: z.string().optional(),
	prospectCompanySize: z.string().optional(),
	prospectWebsite: z.string().optional(),
	callType: z.enum(["discovery", "demo", "negotiation", "closing", "follow_up"]),
	meetingGoal: z.string().min(1, "Meeting goal is required"),
	knownPainPoints: z.array(z.string()).optional(),
	previousInteractions: z.string().optional(),
	notes: z.string().optional(),
});

const updatePrepSchema = createPrepSchema.partial();

const prepIdParamSchema = z.object({
	id: z.coerce.number().int().positive(),
});

const chatSchema = z.object({
	message: z.string().min(1, "Message is required"),
});

const app = new Hono<AuthVariable<false>>()
	// List all preps for current user
	.get("/", requireAuth, async (c) => {
		const currentUser = c.get("user");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ preps: [] });
			}

			const preps = await db
				.select()
				.from(meetingPreps)
				.where(eq(meetingPreps.salespersonId, salespersonResult.salesperson.id))
				.orderBy(desc(meetingPreps.createdAt));

			logger.info({ count: preps.length, salespersonId: salespersonResult.salesperson.id }, "Listed meeting preps");

			return c.json({ preps });
		} catch (error) {
			logger.error({ error }, "Failed to list meeting preps");
			return c.json({ error: "Failed to list meeting preps" }, 500);
		}
	})

	// Create new prep
	.post("/", requireAuth, zValidator("json", createPrepSchema), async (c) => {
		const currentUser = c.get("user");
		const data = c.req.valid("json");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Salesperson not found for current user" }, 404);
			}

			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ error: "Company not found for current user" }, 404);
			}

			const [prep] = await db
				.insert(meetingPreps)
				.values({
					salespersonId: salespersonResult.salesperson.id,
					companyId,
					prospectCompany: data.prospectCompany,
					prospectContactName: data.prospectContactName,
					prospectContactRole: data.prospectContactRole,
					prospectIndustry: data.prospectIndustry,
					prospectCompanySize: data.prospectCompanySize,
					prospectWebsite: data.prospectWebsite,
					callType: data.callType,
					meetingGoal: data.meetingGoal,
					knownPainPoints: data.knownPainPoints,
					previousInteractions: data.previousInteractions,
					notes: data.notes,
					status: "setup",
				})
				.returning();

			logger.info({ prepId: prep.id, prospectCompany: data.prospectCompany }, "Created meeting prep");

			return c.json({ prep }, 201);
		} catch (error) {
			logger.error({ error }, "Failed to create meeting prep");
			return c.json({ error: "Failed to create meeting prep" }, 500);
		}
	})

	// Get prep by ID
	.get("/:id", requireAuth, zValidator("param", prepIdParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const currentUser = c.get("user");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			const [prep] = await db
				.select()
				.from(meetingPreps)
				.where(and(eq(meetingPreps.id, id), eq(meetingPreps.salespersonId, salespersonResult.salesperson.id)))
				.limit(1);

			if (!prep) {
				return c.json({ error: "Meeting prep not found" }, 404);
			}

			return c.json({ prep });
		} catch (error) {
			logger.error({ error, prepId: id }, "Failed to get meeting prep");
			return c.json({ error: "Failed to get meeting prep" }, 500);
		}
	})

	// Update prep
	.patch("/:id", requireAuth, zValidator("param", prepIdParamSchema), zValidator("json", updatePrepSchema), async (c) => {
		const { id } = c.req.valid("param");
		const data = c.req.valid("json");
		const currentUser = c.get("user");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Verify ownership
			const [existing] = await db
				.select()
				.from(meetingPreps)
				.where(and(eq(meetingPreps.id, id), eq(meetingPreps.salespersonId, salespersonResult.salesperson.id)))
				.limit(1);

			if (!existing) {
				return c.json({ error: "Meeting prep not found" }, 404);
			}

			const [prep] = await db
				.update(meetingPreps)
				.set({
					...data,
					updatedAt: new Date(),
				})
				.where(eq(meetingPreps.id, id))
				.returning();

			logger.info({ prepId: id }, "Updated meeting prep");

			return c.json({ prep });
		} catch (error) {
			logger.error({ error, prepId: id }, "Failed to update meeting prep");
			return c.json({ error: "Failed to update meeting prep" }, 500);
		}
	})

	// Delete prep
	.delete("/:id", requireAuth, zValidator("param", prepIdParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const currentUser = c.get("user");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Verify ownership
			const [existing] = await db
				.select()
				.from(meetingPreps)
				.where(and(eq(meetingPreps.id, id), eq(meetingPreps.salespersonId, salespersonResult.salesperson.id)))
				.limit(1);

			if (!existing) {
				return c.json({ error: "Meeting prep not found" }, 404);
			}

			await db.delete(meetingPreps).where(eq(meetingPreps.id, id));

			logger.info({ prepId: id }, "Deleted meeting prep");

			return c.json({ success: true });
		} catch (error) {
			logger.error({ error, prepId: id }, "Failed to delete meeting prep");
			return c.json({ error: "Failed to delete meeting prep" }, 500);
		}
	})

	// Generate prep guide
	.post("/:id/generate", requireAuth, zValidator("param", prepIdParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const currentUser = c.get("user");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Verify ownership
			const [existing] = await db
				.select()
				.from(meetingPreps)
				.where(and(eq(meetingPreps.id, id), eq(meetingPreps.salespersonId, salespersonResult.salesperson.id)))
				.limit(1);

			if (!existing) {
				return c.json({ error: "Meeting prep not found" }, 404);
			}

			logger.info({ prepId: id }, "Generating prep guide");

			const prepGuide = await MeetingPrepService.generatePrepGuide(existing);

			// Update prep with generated guide
			const [prep] = await db
				.update(meetingPreps)
				.set({
					prepGuide,
					status: "ready",
					updatedAt: new Date(),
				})
				.where(eq(meetingPreps.id, id))
				.returning();

			logger.info({ prepId: id }, "Generated prep guide");

			return c.json({ prep });
		} catch (error) {
			logger.error({ error, prepId: id }, "Failed to generate prep guide");
			return c.json({ error: "Failed to generate prep guide" }, 500);
		}
	})

	// Chat with prep context (streaming)
	.post("/:id/chat", requireAuth, zValidator("param", prepIdParamSchema), zValidator("json", chatSchema), async (c) => {
		const { id } = c.req.valid("param");
		const { message } = c.req.valid("json");
		const currentUser = c.get("user");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Verify ownership and get prep
			const [prep] = await db
				.select()
				.from(meetingPreps)
				.where(and(eq(meetingPreps.id, id), eq(meetingPreps.salespersonId, salespersonResult.salesperson.id)))
				.limit(1);

			if (!prep) {
				return c.json({ error: "Meeting prep not found" }, 404);
			}

			logger.info({ prepId: id, messageLength: message.length }, "Starting chat stream");

			// Add user message to history
			const chatHistory = (prep.chatHistory ?? []) as Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;
			chatHistory.push({
				role: "user",
				content: message,
				timestamp: new Date().toISOString(),
			});

			// Stream the response using SSE
			return streamSSE(c, async (stream) => {
				let fullResponse = "";

				try {
					for await (const chunk of MeetingPrepService.chat(prep, message)) {
						fullResponse += chunk;
						await stream.writeSSE({
							data: JSON.stringify({ chunk }),
							event: "message",
						});
					}

					// Save the complete response to chat history
					chatHistory.push({
						role: "assistant",
						content: fullResponse,
						timestamp: new Date().toISOString(),
					});

					await db
						.update(meetingPreps)
						.set({
							chatHistory,
							updatedAt: new Date(),
						})
						.where(eq(meetingPreps.id, id));

					await stream.writeSSE({
						data: JSON.stringify({ done: true }),
						event: "done",
					});

					logger.info({ prepId: id, responseLength: fullResponse.length }, "Completed chat stream");
				} catch (error) {
					logger.error({ error, prepId: id }, "Error during chat stream");
					await stream.writeSSE({
						data: JSON.stringify({ error: "Stream error" }),
						event: "error",
					});
				}
			});
		} catch (error) {
			logger.error({ error, prepId: id }, "Failed to start chat");
			return c.json({ error: "Failed to start chat" }, 500);
		}
	})

	// Start roleplay session
	.post("/:id/start-roleplay", requireAuth, zValidator("param", prepIdParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const currentUser = c.get("user");

		try {
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Verify ownership
			const [prep] = await db
				.select()
				.from(meetingPreps)
				.where(and(eq(meetingPreps.id, id), eq(meetingPreps.salespersonId, salespersonResult.salesperson.id)))
				.limit(1);

			if (!prep) {
				return c.json({ error: "Meeting prep not found" }, 404);
			}

			let agentId = prep.agentId;

			// Reuse existing agent or create new one
			if (!agentId) {
				logger.info({ prepId: id }, "Creating new roleplay agent for meeting prep");

				const personaConfig = await MeetingPrepService.generateRoleplayPersona(prep);

				const agentResult = await elevenlabsConversational.createTrainingAgent(personaConfig.systemPrompt, personaConfig.firstMessage);
				agentId = agentResult.agentId;

				// Store agent info
				await db
					.update(meetingPreps)
					.set({
						agentId,
						agentPrompt: {
							systemPrompt: personaConfig.systemPrompt,
							firstMessage: personaConfig.firstMessage,
						},
						updatedAt: new Date(),
					})
					.where(eq(meetingPreps.id, id));

				logger.info({ prepId: id, agentId }, "Created roleplay agent");
			} else {
				logger.info({ prepId: id, agentId }, "Reusing existing roleplay agent");
			}

			// Get signed URL
			const signedUrlResponse = await elevenlabsConversational.getSignedUrl(agentId, false);

			return c.json({
				agentId,
				signedUrl: signedUrlResponse.signedUrl,
				prep,
			});
		} catch (error) {
			logger.error({ error, prepId: id }, "Failed to start roleplay");
			return c.json({ error: "Failed to start roleplay" }, 500);
		}
	})

	// Complete roleplay session
	.post(
		"/:id/complete",
		requireAuth,
		zValidator("param", prepIdParamSchema),
		zValidator(
			"json",
			z
				.object({
					conversationId: z.string().optional(),
					score: z.number().min(0).max(10).optional(),
					duration: z.number().int().positive().optional(),
				})
				.optional(),
		),
		async (c) => {
			const { id } = c.req.valid("param");
			const sessionData = c.req.valid("json") ?? {};
			const currentUser = c.get("user");

			try {
				const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

				if (!salespersonResult) {
					return c.json({ error: "Unauthorized" }, 401);
				}

				// Verify ownership
				const [existing] = await db
					.select()
					.from(meetingPreps)
					.where(and(eq(meetingPreps.id, id), eq(meetingPreps.salespersonId, salespersonResult.salesperson.id)))
					.limit(1);

				if (!existing) {
					return c.json({ error: "Meeting prep not found" }, 404);
				}

				const [prep] = await db
					.update(meetingPreps)
					.set({
						status: "practiced",
						updatedAt: new Date(),
					})
					.where(eq(meetingPreps.id, id))
					.returning();

				logger.info({ prepId: id, sessionData }, "Completed meeting prep roleplay");

				return c.json({ success: true, prep });
			} catch (error) {
				logger.error({ error, prepId: id }, "Failed to complete roleplay");
				return c.json({ error: "Failed to complete roleplay" }, 500);
			}
		},
	);

export default app;
