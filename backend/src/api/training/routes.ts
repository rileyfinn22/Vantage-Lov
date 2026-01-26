import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { flagDetailsData } from "#/vantage/training";
import elevenlabsConversational from "#/vantage/elevenlabsConversational";
import { PersonaGenerationService } from "#/services/PersonaGenerationService";
import { getRoleplayPersonaGeneratorService, serializeTranscriptForRoleplay } from "#/services/RoleplayPersonaGeneratorService";
import { logger } from "#/lib/logger";
import { db } from "#/data";
import {
	flags,
	trainingScenarios,
	salespeople,
	trainingSessionsCompleted,
	battleCards,
	trainingAssignments,
	interactions,
	authUserRoles,
	companies,
} from "#/data/schema";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import { checkSalespersonAccess, getUserCompanyId, getSalespersonForUserWithAdminFallback } from "#/middleware/authorization";
import assignmentsRouter from "./assignments";
import { requireAuth } from "#/middleware/auth";
import { FEATURES } from "#/config";
import { workflowState } from "#/data/schema";
import { WorkflowQueueService } from "#/services/WorkflowQueueService";

// Zod validation schemas
const flagIdParamSchema = z.object({
	flagId: z.coerce.number().int().positive(),
});

const skillKeyParamSchema = z.object({
	skillKey: z.string().min(1),
});

const scenarioIdParamSchema = z.object({
	scenarioId: z.string().min(1),
});

// Zod schema for conversation audio
const conversationIdParamSchema = z.object({
	conversationId: z.string().min(1),
});

const app = new Hono<AuthVariable<false>>()
	.route("/assignments", assignmentsRouter)
	// Get workflow status (for polling)
	.get("/workflow/:workflowId/status", requireAuth, zValidator("param", z.object({ workflowId: z.coerce.number().int().positive() })), async (c) => {
		const { workflowId } = c.req.valid("param");
		const currentUser = c.get("user");

		try {
			const workflow = await db.select().from(workflowState).where(eq(workflowState.id, workflowId)).limit(1);

			if (workflow.length === 0) {
				return c.json({ error: "Workflow not found" }, 404);
			}

			const state = workflow[0];

			// Check authorization - ensure user owns this workflow
			const metadata = state.metadata ?? {};
			if (metadata.userId !== currentUser.id) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			return c.json({
				workflowId: state.id,
				status: state.status,
				currentStep: state.currentStep,
				result: state.result,
				error: state.error,
				createdAt: state.createdAt.toISOString(),
				updatedAt: state.updatedAt.toISOString(),
				completedAt: state.completedAt?.toISOString() ?? null,
			});
		} catch (error) {
			logger.error({ error, workflowId }, "Failed to get workflow status");
			return c.json(
				{
					error: "Failed to get workflow status",
					details: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	})
	// Get conversation audio from ElevenLabs
	.get("/conversation/:conversationId/audio", requireAuth, zValidator("param", conversationIdParamSchema), async (c) => {
		const { conversationId } = c.req.valid("param");

		try {
			logger.info({ conversationId }, "Fetching conversation audio");
			const audioStream = await elevenlabsConversational.getConversationAudio(conversationId);

			// Return the audio as an MP3 stream
			return new Response(audioStream, {
				headers: {
					"Content-Type": "audio/mpeg",
					"Cache-Control": "public, max-age=3600",
				},
			});
		} catch (error) {
			logger.error({ error, conversationId }, "Failed to fetch conversation audio");
			return c.json(
				{
					error: "Failed to fetch conversation audio",
					details: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	})
	.get("/scenarios/:skillKey", requireAuth, zValidator("param", skillKeyParamSchema), async (c) => {
		const { skillKey } = c.req.valid("param");

		try {
			// Get all scenarios for the given skill key
			const scenarios = await db.select().from(trainingScenarios).where(eq(trainingScenarios.skillKey, skillKey));

			logger.info({ skillKey, count: scenarios.length }, "Retrieved training scenarios");

			return c.json({ scenarios });
		} catch (error) {
			logger.error({ error, skillKey }, "Failed to retrieve training scenarios");
			return c.json(
				{
					error: "Failed to retrieve training scenarios",
					details: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	})
	.get("/scenario/:scenarioId", requireAuth, zValidator("param", scenarioIdParamSchema), async (c) => {
		const { scenarioId } = c.req.valid("param");
		const currentUser = c.get("user");

		try {
			// Support lookup by either numeric ID or string scenarioId
			const isNumericId = /^\d+$/.test(scenarioId);
			const scenarios = isNumericId
				? await db
						.select()
						.from(trainingScenarios)
						.where(eq(trainingScenarios.id, parseInt(scenarioId, 10)))
						.limit(1)
				: await db.select().from(trainingScenarios).where(eq(trainingScenarios.scenarioId, scenarioId)).limit(1);

			if (scenarios.length === 0) {
				return c.json({ error: "Scenario not found" }, 404);
			}

			const scenario = scenarios[0];

			// Fetch linked battle card (battle card references scenario via linkedScenarioId)
			const [linkedBattleCard] = await db.select().from(battleCards).where(eq(battleCards.linkedScenarioId, scenario.id)).limit(1);
			const battleCard = linkedBattleCard ?? null;

			// Check for completed training session for this user
			let completedSession = null;
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (salespersonResult) {
				const completedSessions = await db
					.select()
					.from(trainingSessionsCompleted)
					.where(
						and(
							eq(trainingSessionsCompleted.scenarioId, scenario.id),
							eq(trainingSessionsCompleted.salespersonId, salespersonResult.salesperson.id),
							eq(trainingSessionsCompleted.status, "completed"),
						),
					)
					.orderBy(desc(trainingSessionsCompleted.completedAt))
					.limit(1);

				if (completedSessions.length > 0) {
					completedSession = {
						id: completedSessions[0].id,
						completedAt: completedSessions[0].completedAt?.toISOString() ?? null,
						trainingSession: completedSessions[0].trainingSession,
					};
				}
			}

			logger.info({ scenarioId, hasCompletedSession: !!completedSession }, "Retrieved training scenario");
			return c.json({ scenario, battleCard, completedSession });
		} catch (error) {
			logger.error({ error, scenarioId }, "Failed to retrieve training scenario");
			return c.json(
				{
					error: "Failed to retrieve training scenario",
					details: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	})
	.post("/scenario/:scenarioId/start-session", requireAuth, zValidator("param", scenarioIdParamSchema), async (c) => {
		const { scenarioId } = c.req.valid("param");
		const currentUser = c.get("user");

		try {
			// Get salesperson ID from current user OR fallback for admins
			const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

			if (!salespersonResult) {
				return c.json({ error: "Salesperson not found for current user" }, 404);
			}

			const { salesperson, isAdminFallback } = salespersonResult;
			const salespersonId = salesperson.id;

			if (isAdminFallback) {
				logger.info({ userId: currentUser.id, salespersonId }, "Admin user using fallback salesperson for training");
			}

			// Get scenario details - support lookup by numeric ID or string scenarioId
			const isNumericId = /^\d+$/.test(scenarioId);
			const scenarios = isNumericId
				? await db
						.select()
						.from(trainingScenarios)
						.where(eq(trainingScenarios.id, parseInt(scenarioId, 10)))
						.limit(1)
				: await db.select().from(trainingScenarios).where(eq(trainingScenarios.scenarioId, scenarioId)).limit(1);

			if (scenarios.length === 0) {
				return c.json({ error: "Scenario not found" }, 404);
			}

			const scenario = scenarios[0];

			// Check authorization - admins already validated above, salespeople check access
			const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson);
			if (!hasAccess) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Optional agentic orchestration parameters (query string)
			const q = c.req.query();
			const agentic = q.agentic === "true" || q.agentic === "1";
			const allowReuse = !(q.allowReuse === "false" || q.allowReuse === "0");
			const maxIterations = q.maxIterations ? Number.parseInt(q.maxIterations, 10) : undefined;

			// Async workflow path (feature flag)
			if (FEATURES.ASYNC_SESSION_START) {
				// Create workflow state
				const [workflow] = await db
					.insert(workflowState)
					.values({
						workflowType: "scenario_session",
						workflowId: scenarioId,
						status: "pending",
						metadata: {
							userId: currentUser.id,
							salespersonId,
							scenarioId: isNumericId ? parseInt(scenarioId, 10) : scenarioId,
							agentic: agentic ? true : false,
							allowReuse,
							maxIterations: maxIterations ?? undefined,
						},
					})
					.returning();

				// Enqueue job
				await WorkflowQueueService.enqueue(workflow.id);

				logger.info({ workflowId: workflow.id, scenarioId, salespersonId }, "Enqueued scenario session workflow");

				return c.json({
					workflowId: workflow.id,
					status: "pending",
					message: "Workflow started, poll /training/workflow/:workflowId/status for updates",
				});
			}

			// Synchronous path (existing code - kept for rollback)
			// Check for existing in_progress session (EXACTLY LIKE FLAGS)
			let session = await db.query.trainingSessionsCompleted.findFirst({
				where: and(
					eq(trainingSessionsCompleted.scenarioId, scenario.id),
					eq(trainingSessionsCompleted.salespersonId, salespersonId),
					eq(trainingSessionsCompleted.status, "in_progress"),
				),
			});

			let agentId: string;

			// Reuse existing agent OR create new (EXACTLY LIKE FLAGS)
			if (session?.agentId) {
				logger.info({ scenarioId, salespersonId, agentId: session.agentId }, "Reusing existing agent for scenario session");
				agentId = session.agentId;
			} else {
				logger.info({ scenarioId, salespersonId }, "Creating new agent for scenario session");

				// Generate persona using PersonaGenerationService
				const elevenLabsConfig = await PersonaGenerationService.generateElevenLabsConfig(scenario.id, salespersonId);

				// Create ElevenLabs agent
				const agentResult = await elevenlabsConversational.createTrainingAgent(elevenLabsConfig.prompt, elevenLabsConfig.first_message);

				agentId = agentResult.agentId;

				// Store session with agent (LIKE FLAGS STORE ON FLAG)
				if (!session) {
					const [newSession] = await db
						.insert(trainingSessionsCompleted)
						.values({
							scenarioId: scenario.id,
							salespersonId,
							agentId,
							agentPrompt: {
								systemPrompt: elevenLabsConfig.prompt,
								firstMessage: elevenLabsConfig.first_message,
							},
							status: "in_progress",
						})
						.returning();
					session = newSession;
				} else {
					await db
						.update(trainingSessionsCompleted)
						.set({
							agentId,
							agentPrompt: {
								systemPrompt: elevenLabsConfig.prompt,
								firstMessage: elevenLabsConfig.first_message,
							},
						})
						.where(eq(trainingSessionsCompleted.id, session.id));
				}

				logger.info({ scenarioId, salespersonId, agentId }, "Created and stored agent for scenario session");
			}

			// Get signed URL (EXACTLY LIKE FLAGS)
			const signedUrlResponse = await elevenlabsConversational.getSignedUrl(agentId, false);

			// Fetch linked battle card (battle card references scenario via linkedScenarioId)
			const [linkedBattleCard] = await db.select().from(battleCards).where(eq(battleCards.linkedScenarioId, scenario.id)).limit(1);
			const battleCard = linkedBattleCard ?? null;

			logger.info({ scenarioId, salespersonId, agentId, sessionId: session.id }, "Training session started");

			return c.json({
				agentId,
				signedUrl: signedUrlResponse.signedUrl,
				sessionId: session.id,
				scenario,
				battleCard,
			});
		} catch (error) {
			logger.error({ error, scenarioId }, "Failed to start scenario training session");
			return c.json(
				{
					error: "Failed to start training session",
					details: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	})
	.post("/flag/:flagId/start-session", requireAuth, zValidator("param", flagIdParamSchema), async (c) => {
		const flagId = c.req.valid("param").flagId;
		const currentUser = c.get("user");

		try {
			// Get flag details with authorization check
			const flagDetails = await flagDetailsData(flagId);

			if (!flagDetails) {
				return c.json({ error: "Flag not found" }, 404);
			}

			// Check authorization
			const hasAccess = await checkSalespersonAccess(currentUser.id, flagDetails.salesperson.salesperson);
			if (!hasAccess) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Optional agentic orchestration parameters (query string)
			const q = c.req.query();
			const agentic = q.agentic === "true" || q.agentic === "1";
			const allowReuse = !(q.allowReuse === "false" || q.allowReuse === "0");
			const maxIterations = q.maxIterations ? Number.parseInt(q.maxIterations, 10) : undefined;

			// Async workflow path (feature flag)
			if (FEATURES.ASYNC_SESSION_START) {
				// Create workflow state
				const [workflow] = await db
					.insert(workflowState)
					.values({
						workflowType: "flag_session",
						workflowId: flagId.toString(),
						status: "pending",
						metadata: {
							userId: currentUser.id,
							salespersonId: flagDetails.salesperson.salesperson.id,
							flagId,
							agentic: agentic ? true : false,
							allowReuse,
							maxIterations: maxIterations ?? undefined,
						},
					})
					.returning();

				// Enqueue job
				await WorkflowQueueService.enqueue(workflow.id);

				logger.info({ workflowId: workflow.id, flagId }, "Enqueued flag session workflow");

				return c.json({
					workflowId: workflow.id,
					status: "pending",
					message: "Workflow started, poll /training/workflow/:workflowId/status for updates",
				});
			}

			// Synchronous path (existing code - kept for rollback)

			let agentId: string;
			let prospectData: { name: string; role: string; company: string; industry: string } | null = null;

			// Get stored prompt (generated during analysis phase)
			let storedPrompt = flagDetails.flag.agentPrompt as { systemPrompt: string; firstMessage: string; metadata?: unknown } | null;

			if (!storedPrompt) {
				// No roleplay persona was generated during analysis - generate on-demand
				logger.info({ flagId }, "No roleplay persona found - generating on-demand");

				const roleplayService = getRoleplayPersonaGeneratorService();
				if (!roleplayService) {
					logger.error({ flagId }, "Roleplay service not available");
					return c.json({ error: "Training service unavailable" }, 503);
				}

				// Get transcript and company ID from flagDetails
				const transcript = flagDetails.interaction?.v1_raw_google_diarized ?? null;
				const companyId = flagDetails.salesperson?.salesperson?.companyId ?? null;

				// Build flag data from the flag's flagData field
				const flagData = flagDetails.flag.flagData;
				const betterResponseStr = flagData
					? Array.isArray(flagData.better_response)
						? flagData.better_response.join("\n\nOR\n\n")
						: (flagData.better_response ?? "")
					: "";

				try {
					const roleplayResult = await roleplayService.generateFromFlag({
						transcript,
						flag: {
							reason: flagData?.flag_title ?? "Training scenario",
							flagData: flagData
								? {
										flag_title: flagData.flag_title ?? "",
										what_happened: flagData.what_happened ?? "",
										// prospect_quote and rep_quote can be derived from transcript_segment
										prospect_quote: flagData.transcript_segment?.join("\n") ?? "",
										rep_quote: "",
										what_went_wrong: flagData.revenue_impact ?? "",
										better_response: betterResponseStr,
										timestamps: flagData.timestamps ?? undefined,
									}
								: undefined,
						},
						companyId,
					});

					// Save to flag - use type assertion for the drizzle update
					const generatedPrompt = {
						systemPrompt: roleplayResult.systemPrompt,
						firstMessage: roleplayResult.firstMessage,
						metadata: roleplayResult.metadata,
					};
					storedPrompt = generatedPrompt;

					await db
						.update(flags)
						.set({ agentPrompt: generatedPrompt as (typeof flags.$inferSelect)["agentPrompt"] })
						.where(eq(flags.id, flagId));

					logger.info({ flagId }, "Generated and stored roleplay persona on-demand");
				} catch (error) {
					logger.error({ flagId, error }, "Failed to generate roleplay persona on-demand");
					return c.json({ error: "Failed to generate training persona. Please try again." }, 500);
				}
			}

			// Extract prospect data from stored metadata
			const storedMetadata = storedPrompt.metadata as
				| { prospect?: { name: string; role: string; company: string; industry: string } }
				| undefined;
			if (storedMetadata?.prospect) {
				prospectData = storedMetadata.prospect;
			}

			// Check if we already have an ElevenLabs agent
			if (flagDetails.flag.agentId) {
				// Reuse existing agent
				logger.info({ flagId, agentId: flagDetails.flag.agentId }, "Reusing existing ElevenLabs agent for flag");
				agentId = flagDetails.flag.agentId;
			} else {
				// Create ElevenLabs agent with the stored persona
				logger.info({ flagId }, "Creating ElevenLabs agent with stored persona");

				const agentResult = await elevenlabsConversational.createTrainingAgent(storedPrompt.systemPrompt, storedPrompt.firstMessage);
				agentId = agentResult.agentId;

				// Store agent ID in database
				await db.update(flags).set({ agentId }).where(eq(flags.id, flagId));

				logger.info({ flagId, agentId, prospectName: prospectData?.name }, "Created ElevenLabs agent");
			}

			// Get signed URL for the conversation
			const signedUrlResponse = await elevenlabsConversational.getSignedUrl(agentId, false);

			logger.info({ flagId, agentId }, "Training session started");

			return c.json({
				signedUrl: signedUrlResponse.signedUrl,
				agentId,
				flag: flagDetails.flag,
				interaction: flagDetails.interaction,
				salesperson: flagDetails.salesperson.salesperson,
				prospectData,
			});
		} catch (error) {
			logger.error({ error, flagId }, "Failed to start training session");
			return c.json(
				{
					error: "Failed to start training session",
					details: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	})
	.post(
		"/flag/:flagId/complete",
		requireAuth,
		zValidator("param", flagIdParamSchema),
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
			const flagId = c.req.valid("param").flagId;
			const currentUser = c.get("user");
			const sessionData = c.req.valid("json") ?? {};

			try {
				// Get flag details with authorization check
				const flagDetails = await flagDetailsData(flagId);

				if (!flagDetails) {
					return c.json({ error: "Flag not found" }, 404);
				}

				// Check authorization
				const hasAccess = await checkSalespersonAccess(currentUser.id, flagDetails.salesperson.salesperson);
				if (!hasAccess) {
					return c.json({ error: "Unauthorized" }, 401);
				}

				// Mark flag as complete with training session data
				await db
					.update(flags)
					.set({
						complete: true,
						trainingSession: {
							conversationId: sessionData.conversationId,
							score: sessionData.score,
							duration: sessionData.duration,
							completedAt: new Date().toISOString(),
						},
					})
					.where(eq(flags.id, flagId));

				logger.info({ flagId, sessionData }, "Flag training marked as complete");

				// Also mark any related training assignments as complete
				const salespersonId = flagDetails.salesperson.salesperson.id;
				const updatedFlagAssignments = await db
					.update(trainingAssignments)
					.set({
						status: "completed",
						completedAt: new Date(),
					})
					.where(
						and(
							eq(trainingAssignments.trainingType, "flag_review"),
							eq(trainingAssignments.salespersonId, salespersonId),
							or(eq(trainingAssignments.status, "pending"), eq(trainingAssignments.status, "in_progress")),
							eq(trainingAssignments.trainingId, flagId.toString()),
						),
					)
					.returning();

				if (updatedFlagAssignments.length > 0) {
					logger.info({ count: updatedFlagAssignments.length, flagId, salespersonId }, "Flag training assignments marked as complete");
				}

				return c.json({ success: true, flagId });
			} catch (error) {
				logger.error({ error, flagId }, "Failed to complete flag training");
				return c.json(
					{
						error: "Failed to complete training",
						details: error instanceof Error ? error.message : "Unknown error",
					},
					500,
				);
			}
		},
	)
	.post(
		"/scenario/:scenarioId/complete",
		requireAuth,
		zValidator("param", scenarioIdParamSchema),
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
			const { scenarioId } = c.req.valid("param");
			const currentUser = c.get("user");
			const sessionData = c.req.valid("json") ?? {};

			logger.info({ scenarioId, userId: currentUser.id, sessionData }, "COMPLETION ENDPOINT CALLED: scenario/:scenarioId/complete");

			try {
				// Get salesperson ID from current user OR fallback for admins
				const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

				if (salespersonResult?.isAdminFallback) {
					logger.info(
						{ userId: currentUser.id, salespersonId: salespersonResult.salesperson.id },
						"Admin user using fallback salesperson for training completion",
					);
				}

				// Get scenario - support lookup by either numeric ID or string scenarioId
				const isNumericId = /^\d+$/.test(scenarioId);
				const scenarios = isNumericId
					? await db
							.select()
							.from(trainingScenarios)
							.where(eq(trainingScenarios.id, parseInt(scenarioId, 10)))
							.limit(1)
					: await db.select().from(trainingScenarios).where(eq(trainingScenarios.scenarioId, scenarioId)).limit(1);

				if (scenarios.length === 0) {
					return c.json({ error: "Scenario not found" }, 404);
				}

				const scenario = scenarios[0];

				// Find and update the in_progress session with training session data
				const session = await db.query.trainingSessionsCompleted.findFirst({
					where: and(eq(trainingSessionsCompleted.scenarioId, scenario.id), eq(trainingSessionsCompleted.status, "in_progress")),
				});

				if (session) {
					await db
						.update(trainingSessionsCompleted)
						.set({
							status: "completed",
							completedAt: new Date(),
							// Store training session data (conversationId, score, duration)
							trainingSession: {
								conversationId: sessionData.conversationId,
								score: sessionData.score,
								duration: sessionData.duration,
								completedAt: new Date().toISOString(),
							},
						})
						.where(eq(trainingSessionsCompleted.id, session.id));

					logger.info({ scenarioId, sessionId: session.id, sessionData }, "Scenario training session marked as complete");
				}

				// Also mark any related training assignments as complete
				if (salespersonResult) {
					const salespersonId = salespersonResult.salesperson.id;

					// Mark scenario-type assignments (skills training) as completed
					// trainingId can be the scenario's numeric ID, string scenarioId, or skill display name
					// Convert skill_key to display name format (e.g., "objection_handling" -> "Objection Handling")
					const skillKeyToDisplayName = (key: string) =>
						key
							.split("_")
							.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
							.join(" ");
					const skillDisplayName = scenario.skillKey ? skillKeyToDisplayName(scenario.skillKey) : "";

					// Debug: Log what we're trying to match
					logger.info(
						{
							salespersonId,
							scenarioNumericId: scenario.id.toString(),
							scenarioStringId: scenario.scenarioId,
							skillDisplayName,
						},
						"Attempting to update scenario assignments with these match criteria",
					);

					// Debug: Check what pending scenario assignments exist for this salesperson
					const existingPendingAssignments = await db
						.select()
						.from(trainingAssignments)
						.where(
							and(
								eq(trainingAssignments.trainingType, "scenario"),
								eq(trainingAssignments.salespersonId, salespersonId),
								or(eq(trainingAssignments.status, "pending"), eq(trainingAssignments.status, "in_progress")),
							),
						);
					logger.info(
						{
							count: existingPendingAssignments.length,
							assignments: existingPendingAssignments.map((a) => ({
								id: a.id,
								trainingId: a.trainingId,
								status: a.status,
								salespersonId: a.salespersonId,
							})),
						},
						"Existing pending scenario assignments for this salesperson",
					);

					// Check for both pending and in_progress statuses
					const updatedScenarioAssignments = await db
						.update(trainingAssignments)
						.set({
							status: "completed",
							completedAt: new Date(),
						})
						.where(
							and(
								eq(trainingAssignments.trainingType, "scenario"),
								eq(trainingAssignments.salespersonId, salespersonId),
								or(eq(trainingAssignments.status, "pending"), eq(trainingAssignments.status, "in_progress")),
								or(
									eq(trainingAssignments.trainingId, scenario.id.toString()),
									eq(trainingAssignments.trainingId, scenario.scenarioId ?? ""),
									eq(trainingAssignments.trainingId, skillDisplayName),
								),
							),
						)
						.returning();

					if (updatedScenarioAssignments.length > 0) {
						logger.info(
							{ count: updatedScenarioAssignments.length, scenarioId: scenario.scenarioId, salespersonId },
							"Scenario assignments marked as complete",
						);
					}

					// Also check for linked battle card assignments
					logger.info({ scenarioId: scenario.id, salespersonId }, "Checking for linked battle card assignments");
					const linkedBattleCard = await db.select().from(battleCards).where(eq(battleCards.linkedScenarioId, scenario.id)).limit(1);
					logger.info(
						{ linkedBattleCardFound: linkedBattleCard.length > 0, linkedBattleCardId: linkedBattleCard[0]?.id },
						"Battle card lookup result",
					);

					if (linkedBattleCard.length > 0) {
						// First, check what assignments exist for debugging
						const existingAssignments = await db
							.select()
							.from(trainingAssignments)
							.where(and(eq(trainingAssignments.trainingType, "battle_card"), eq(trainingAssignments.salespersonId, salespersonId)));
						logger.info(
							{
								battleCardId: linkedBattleCard[0].id,
								salespersonId,
								existingAssignments: existingAssignments.map((a) => ({ id: a.id, trainingId: a.trainingId, status: a.status })),
							},
							"Existing battle card assignments for salesperson",
						);

						const updatedBattleCardAssignments = await db
							.update(trainingAssignments)
							.set({
								status: "completed",
								completedAt: new Date(),
							})
							.where(
								and(
									eq(trainingAssignments.trainingType, "battle_card"),
									eq(trainingAssignments.trainingId, linkedBattleCard[0].id.toString()),
									eq(trainingAssignments.salespersonId, salespersonId),
									or(eq(trainingAssignments.status, "pending"), eq(trainingAssignments.status, "in_progress")),
								),
							)
							.returning();

						logger.info(
							{ battleCardId: linkedBattleCard[0].id, salespersonId, updatedCount: updatedBattleCardAssignments.length },
							"Related battle card assignment marked as complete",
						);
					}
				}

				return c.json({ success: true, scenarioId });
			} catch (error) {
				logger.error({ error, scenarioId }, "Failed to complete scenario training");
				return c.json(
					{
						error: "Failed to complete training",
						details: error instanceof Error ? error.message : "Unknown error",
					},
					500,
				);
			}
		},
	)
	.get("/completed", requireAuth, async (c) => {
		const currentUser = c.get("user");

		try {
			// Get user's company ID
			const companyId = await getUserCompanyId(currentUser.id);

			// Check if user is site admin
			const userRoles = await db.select().from(authUserRoles).where(eq(authUserRoles.userId, currentUser.id));
			const isSiteAdmin = userRoles.some((role) => role.role === "admin");

			// Get completed training assignments with salesperson info
			let completedAssignmentsQuery = db
				.select({
					id: trainingAssignments.id,
					trainingType: trainingAssignments.trainingType,
					trainingId: trainingAssignments.trainingId,
					title: trainingAssignments.title,
					description: trainingAssignments.description,
					assignmentSource: trainingAssignments.assignmentSource,
					sourceId: trainingAssignments.sourceId,
					completedAt: trainingAssignments.completedAt,
					salespersonId: trainingAssignments.salespersonId,
					salespersonFirstName: salespeople.firstName,
					salespersonLastName: salespeople.lastName,
				})
				.from(trainingAssignments)
				.innerJoin(salespeople, eq(trainingAssignments.salespersonId, salespeople.id))
				.where(eq(trainingAssignments.status, "completed"))
				.orderBy(desc(trainingAssignments.completedAt));

			// Filter by company if not site admin
			const completedAssignments =
				isSiteAdmin || !companyId
					? await completedAssignmentsQuery
					: await db
							.select({
								id: trainingAssignments.id,
								trainingType: trainingAssignments.trainingType,
								trainingId: trainingAssignments.trainingId,
								title: trainingAssignments.title,
								description: trainingAssignments.description,
								assignmentSource: trainingAssignments.assignmentSource,
								sourceId: trainingAssignments.sourceId,
								completedAt: trainingAssignments.completedAt,
								salespersonId: trainingAssignments.salespersonId,
								salespersonFirstName: salespeople.firstName,
								salespersonLastName: salespeople.lastName,
							})
							.from(trainingAssignments)
							.innerJoin(salespeople, eq(trainingAssignments.salespersonId, salespeople.id))
							.where(and(eq(trainingAssignments.status, "completed"), eq(trainingAssignments.companyId, companyId)))
							.orderBy(desc(trainingAssignments.completedAt));

			// Get completed scenario sessions with more details
			// Filter by company if not site admin
			let completedSessionsQuery = db
				.select({
					id: trainingSessionsCompleted.id,
					scenarioId: trainingSessionsCompleted.scenarioId,
					scenarioStringId: trainingScenarios.scenarioId,
					salespersonId: trainingSessionsCompleted.salespersonId,
					startedAt: trainingSessionsCompleted.startedAt,
					completedAt: trainingSessionsCompleted.completedAt,
					trainingSession: trainingSessionsCompleted.trainingSession,
					scenarioTitle: trainingScenarios.title,
					scenarioSkillKey: trainingScenarios.skillKey,
					salespersonFirstName: salespeople.firstName,
					salespersonLastName: salespeople.lastName,
				})
				.from(trainingSessionsCompleted)
				.innerJoin(trainingScenarios, eq(trainingSessionsCompleted.scenarioId, trainingScenarios.id))
				.innerJoin(salespeople, eq(trainingSessionsCompleted.salespersonId, salespeople.id))
				.where(eq(trainingSessionsCompleted.status, "completed"))
				.orderBy(desc(trainingSessionsCompleted.completedAt));

			const completedSessions =
				isSiteAdmin || !companyId
					? await completedSessionsQuery
					: await db
							.select({
								id: trainingSessionsCompleted.id,
								scenarioId: trainingSessionsCompleted.scenarioId,
								scenarioStringId: trainingScenarios.scenarioId,
								salespersonId: trainingSessionsCompleted.salespersonId,
								startedAt: trainingSessionsCompleted.startedAt,
								completedAt: trainingSessionsCompleted.completedAt,
								trainingSession: trainingSessionsCompleted.trainingSession,
								scenarioTitle: trainingScenarios.title,
								scenarioSkillKey: trainingScenarios.skillKey,
								salespersonFirstName: salespeople.firstName,
								salespersonLastName: salespeople.lastName,
							})
							.from(trainingSessionsCompleted)
							.innerJoin(trainingScenarios, eq(trainingSessionsCompleted.scenarioId, trainingScenarios.id))
							.innerJoin(salespeople, eq(trainingSessionsCompleted.salespersonId, salespeople.id))
							.innerJoin(companies, eq(salespeople.companyId, companies.id))
							.where(
								and(
									eq(trainingSessionsCompleted.status, "completed"),
									eq(companies.id, companyId),
								),
							)
							.orderBy(desc(trainingSessionsCompleted.completedAt));

			// Get completed flags (flags with complete = true)
			// Filter by company if not site admin
			let completedFlagsQuery = db
				.select({
					id: flags.id,
					reason: flags.reason,
					flagData: flags.flagData,
					trainingSession: flags.trainingSession,
					createdAt: flags.createdAt,
					salespersonId: salespeople.id,
					salespersonFirstName: salespeople.firstName,
					salespersonLastName: salespeople.lastName,
				})
				.from(flags)
				.innerJoin(salespeople, eq(flags.associatedSalespersonId, salespeople.id))
				.where(eq(flags.complete, true))
				.orderBy(desc(flags.createdAt));

			const completedFlags =
				isSiteAdmin || !companyId
					? await completedFlagsQuery
					: await db
							.select({
								id: flags.id,
								reason: flags.reason,
								flagData: flags.flagData,
								trainingSession: flags.trainingSession,
								createdAt: flags.createdAt,
								salespersonId: salespeople.id,
								salespersonFirstName: salespeople.firstName,
								salespersonLastName: salespeople.lastName,
							})
							.from(flags)
							.innerJoin(salespeople, eq(flags.associatedSalespersonId, salespeople.id))
							.innerJoin(companies, eq(salespeople.companyId, companies.id))
							.where(and(eq(flags.complete, true), eq(companies.id, companyId)))
							.orderBy(desc(flags.createdAt));

			// For battle card assignments, we need to look up the linked scenario ID
			// trainingId for battle_card is the battle card ID, but we need the scenario ID
			const battleCardIds = completedAssignments
				.filter((a) => a.trainingType === "battle_card")
				.map((a) => parseInt(a.trainingId, 10))
				.filter((id) => !isNaN(id));

			// Fetch linked scenarios for battle cards
			const battleCardScenarioMap = new Map<number, string>();
			if (battleCardIds.length > 0) {
				const battleCardsWithScenarios = await db
					.select({
						battleCardId: battleCards.id,
						scenarioId: trainingScenarios.scenarioId,
					})
					.from(battleCards)
					.innerJoin(trainingScenarios, eq(battleCards.linkedScenarioId, trainingScenarios.id))
					.where(inArray(battleCards.id, battleCardIds));

				for (const bc of battleCardsWithScenarios) {
					battleCardScenarioMap.set(bc.battleCardId, bc.scenarioId);
				}
			}

			// For scenario assignments (skills training), we need to look up scenario by skill_key
			// trainingId could be the display name (e.g., "Objection Handling"), numeric ID, or scenarioId string
			const skillDisplayNameToSkillKey = (displayName: string): string => {
				// Convert display name to skill_key format (e.g., "Objection Handling" -> "objection_handling")
				return displayName.toLowerCase().replace(/\s+/g, "_");
			};
			const scenarioSkillAssignments = completedAssignments.filter((a) => a.trainingType === "scenario");

			// Collect all possible lookup values
			const trainingIdsToLookup = scenarioSkillAssignments.map((a) => a.trainingId);
			const skillKeysToLookup = scenarioSkillAssignments.map((a) => skillDisplayNameToSkillKey(a.trainingId));

			// Build a map from trainingId (which could be skill display name, numeric ID, or scenarioId) to scenarioId
			const trainingIdToScenarioIdMap = new Map<string, string>();
			if (trainingIdsToLookup.length > 0) {
				// Get all scenarios that match by skill key, numeric ID, or scenarioId string
				const allScenarios = await db
					.select({
						id: trainingScenarios.id,
						skillKey: trainingScenarios.skillKey,
						scenarioId: trainingScenarios.scenarioId,
					})
					.from(trainingScenarios);

				for (const s of allScenarios) {
					// Map by scenarioId string (e.g., "pricing_objection_1")
					trainingIdToScenarioIdMap.set(s.scenarioId, s.scenarioId);
					// Map by numeric ID
					trainingIdToScenarioIdMap.set(s.id.toString(), s.scenarioId);
					// Map by skill key (e.g., "objection_handling")
					if (s.skillKey && !trainingIdToScenarioIdMap.has(s.skillKey)) {
						trainingIdToScenarioIdMap.set(s.skillKey, s.scenarioId);
					}
				}

				// Also map display names to scenarioId
				for (const displayName of trainingIdsToLookup) {
					const skillKey = skillDisplayNameToSkillKey(displayName);
					const scenarioId = trainingIdToScenarioIdMap.get(skillKey);
					if (scenarioId) {
						trainingIdToScenarioIdMap.set(displayName, scenarioId);
					}
				}
			}

			// Combine into unified format
			const completedTraining = [
				...completedAssignments.map((a) => {
					// For battle card assignments, look up the linked scenario ID
					let scenarioId: string | null = null;
					if (a.trainingType === "battle_card") {
						const bcId = parseInt(a.trainingId, 10);
						scenarioId = !isNaN(bcId) ? (battleCardScenarioMap.get(bcId) ?? null) : null;
					} else if (a.trainingType === "scenario") {
						// For scenario (skill-based) assignments, look up the actual scenarioId
						// trainingId could be display name, numeric ID, skill key, or scenarioId string
						scenarioId = trainingIdToScenarioIdMap.get(a.trainingId) ?? null;
					}

					return {
						id: `assignment-${a.id}`,
						type: a.trainingType,
						title: a.title,
						description: a.description ?? null,
						repName: `${a.salespersonFirstName} ${a.salespersonLastName}`,
						salespersonId: a.salespersonId,
						completedAt: a.completedAt?.toISOString() ?? null,
						source: a.assignmentSource,
						// Include scenarioId for scenario/battle_card assignments
						scenarioId,
					};
				}),
				...completedSessions.map((s) => ({
					id: `session-${s.id}`,
					type: "scenario" as const,
					title: s.scenarioTitle,
					description: s.scenarioSkillKey,
					repName: `${s.salespersonFirstName} ${s.salespersonLastName}`,
					salespersonId: s.salespersonId,
					completedAt: s.trainingSession?.completedAt ?? s.completedAt?.toISOString() ?? null,
					source: "scenario_session" as const,
					score: s.trainingSession?.score ?? null,
					duration: s.trainingSession?.duration ?? null,
					conversationId: s.trainingSession?.conversationId ?? null,
					scenarioId: s.scenarioStringId ?? String(s.scenarioId),
				})),
				...completedFlags.map((f) => ({
					id: `flag-${f.id}`,
					type: "flag_review" as const,
					title: f.flagData?.flag_title ?? f.reason ?? "Training Flag",
					description: f.flagData?.what_happened ?? null,
					repName: `${f.salespersonFirstName} ${f.salespersonLastName}`,
					salespersonId: f.salespersonId,
					completedAt: f.trainingSession?.completedAt ?? f.createdAt?.toISOString() ?? null,
					source: "flag" as const,
					score: f.trainingSession?.score ?? null,
					duration: f.trainingSession?.duration ?? null,
					conversationId: f.trainingSession?.conversationId ?? null,
				})),
			].sort((a, b) => {
				const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
				const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
				return dateB - dateA;
			});

			logger.info({ count: completedTraining.length }, "Retrieved completed training");

			return c.json({ completedTraining });
		} catch (error) {
			logger.error({ error }, "Failed to retrieve completed training");
			return c.json(
				{
					error: "Failed to retrieve completed training",
					details: error instanceof Error ? error.message : "Unknown error",
				},
				500,
			);
		}
	})
	// Get a specific completed training session by ID
	.get("/session/:sessionId", requireAuth, zValidator("param", z.object({ sessionId: z.coerce.number().int().positive() })), async (c) => {
		const { sessionId } = c.req.valid("param");

		try {
			const session = await db
				.select({
					id: trainingSessionsCompleted.id,
					scenarioId: trainingSessionsCompleted.scenarioId,
					salespersonId: trainingSessionsCompleted.salespersonId,
					status: trainingSessionsCompleted.status,
					startedAt: trainingSessionsCompleted.startedAt,
					completedAt: trainingSessionsCompleted.completedAt,
					trainingSession: trainingSessionsCompleted.trainingSession,
					agentId: trainingSessionsCompleted.agentId,
					agentPrompt: trainingSessionsCompleted.agentPrompt,
					scenarioTitle: trainingScenarios.title,
					scenarioSkillKey: trainingScenarios.skillKey,
					scenarioDifficulty: trainingScenarios.difficulty,
					scenarioContext: trainingScenarios.context,
					scenarioObjectives: trainingScenarios.objectives,
					salespersonFirstName: salespeople.firstName,
					salespersonLastName: salespeople.lastName,
				})
				.from(trainingSessionsCompleted)
				.innerJoin(trainingScenarios, eq(trainingSessionsCompleted.scenarioId, trainingScenarios.id))
				.innerJoin(salespeople, eq(trainingSessionsCompleted.salespersonId, salespeople.id))
				.where(eq(trainingSessionsCompleted.id, sessionId))
				.limit(1);

			if (session.length === 0) {
				return c.json({ error: "Training session not found" }, 404);
			}

			const s = session[0];
			return c.json({
				session: {
					id: s.id,
					scenarioId: s.scenarioId,
					salespersonId: s.salespersonId,
					status: s.status,
					startedAt: s.startedAt?.toISOString() ?? null,
					completedAt: s.completedAt?.toISOString() ?? null,
					score: s.trainingSession?.score ?? null,
					duration: s.trainingSession?.duration ?? null,
					conversationId: s.trainingSession?.conversationId ?? null,
					agentId: s.agentId,
					repName: `${s.salespersonFirstName} ${s.salespersonLastName}`,
					scenario: {
						title: s.scenarioTitle,
						skillKey: s.scenarioSkillKey,
						difficulty: s.scenarioDifficulty,
						context: s.scenarioContext,
						objectives: s.scenarioObjectives,
					},
				},
			});
		} catch (error) {
			logger.error({ error, sessionId }, "Failed to retrieve training session");
			return c.json({ error: "Failed to retrieve training session" }, 500);
		}
	})
	// Generate roleplay persona from interaction transcript (5th API call)
	.post(
		"/generate-roleplay-persona/:interactionId",
		requireAuth,
		zValidator("param", z.object({ interactionId: z.coerce.number().int().positive() })),
		zValidator(
			"json",
			z
				.object({
					trainingFocus: z.string().optional(),
				})
				.optional(),
		),
		async (c) => {
			const { interactionId } = c.req.valid("param");
			const body = c.req.valid("json") ?? {};

			try {
				const service = getRoleplayPersonaGeneratorService();
				if (!service) {
					return c.json({ error: "Roleplay persona generation service not available" }, 503);
				}

				// Fetch the interaction with transcript and persona data
				const interaction = await db
					.select({
						id: interactions.id,
						transcript: interactions.v1_raw_google_diarized,
						metadata: interactions.metadata,
						notes: interactions.notes,
					})
					.from(interactions)
					.where(eq(interactions.id, interactionId))
					.limit(1);

				if (interaction.length === 0) {
					return c.json({ error: "Interaction not found" }, 404);
				}

				const interactionData = interaction[0];

				// Serialize transcript for the roleplay context
				const transcriptContext = serializeTranscriptForRoleplay(interactionData.transcript);

				if (!transcriptContext) {
					return c.json({ error: "Interaction has no transcript data" }, 400);
				}

				// Extract persona and metadata - cast to Record<string, unknown> for the JSONB type
				const personaProfile = (interactionData.notes?.psychological_persona as Record<string, unknown> | undefined) ?? null;
				const callMetadata = interactionData.metadata ?? null;

				logger.info(
					{
						interactionId,
						hasTranscript: !!transcriptContext,
						hasPersona: !!personaProfile,
						hasMetadata: !!callMetadata,
						trainingFocus: body.trainingFocus,
					},
					"Generating roleplay persona for interaction",
				);

				// Generate the persona for scenario-based training (skills + battle cards)
				const result = await service.generatePersonaForScenario({
					transcriptContext,
					personaProfile,
					callMetadata,
					trainingFocus: body.trainingFocus,
				});

				logger.info({ interactionId, hasSystemPrompt: !!result.systemPrompt }, "Generated roleplay persona");

				return c.json({
					systemPrompt: result.systemPrompt,
					firstMessage: result.firstMessage,
					voiceCharacteristics: result.voiceCharacteristics,
				});
			} catch (error) {
				logger.error({ error, interactionId }, "Failed to generate roleplay persona");
				return c.json(
					{
						error: "Failed to generate roleplay persona",
						details: error instanceof Error ? error.message : "Unknown error",
					},
					500,
				);
			}
		},
	);

export default app;
