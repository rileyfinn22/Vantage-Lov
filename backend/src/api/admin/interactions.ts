import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { db } from "#/data";
import { eq, inArray, desc, asc, count } from "drizzle-orm";
import * as schema from "#/data/schema";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { logger } from "#/lib/logger";
import type { InteractionWithRelations, InteractionsWithRelationsResponse } from "#/data/types";

const idSchema = z.object({
	id: z.coerce.number().int().min(1),
});

// Query parameter schema for the with-relations endpoint
const withRelationsQuerySchema = z.object({
	salespersonId: z.coerce.number().int().min(1),
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(10),
	sortBy: z.enum(["createdAt", "id", "processedAt", "blurb"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const app = new Hono<AuthVariable<false>>()
	.get(
		"/with-relations",
		zValidator("query", withRelationsQuerySchema, (result, c) => {
			if (!result.success) {
				logger.warn({ issues: result.error.issues }, "Query parameter validation failed");
				return c.json({ error: "Invalid query parameters", details: result.error.issues }, 400);
			}
		}),
		async (c) => {
			const { salespersonId, page, pageSize, sortBy, sortOrder } = c.req.valid("query");

			try {
				// Queries 1 & 2: Get total count and paginated interactions in parallel
				const offset = (page - 1) * pageSize;
				const orderByColumn = schema.interactions[sortBy];
				const orderByFn = sortOrder === "asc" ? asc : desc;

				const [countResult, interactions] = await Promise.all([
					// Query 1: Get total count for pagination
					db
						.select({ count: count() })
						.from(schema.interactions)
						.where(eq(schema.interactions.salespersonId, salespersonId)),
					// Query 2: Load paginated interactions with sorting
					db
						.select()
						.from(schema.interactions)
						.where(eq(schema.interactions.salespersonId, salespersonId))
						.orderBy(orderByFn(orderByColumn))
						.limit(pageSize)
						.offset(offset),
				]);

				const [{ count: totalCount }] = countResult;

				// Handle empty results early
				if (interactions.length === 0) {
					const emptyResponse: InteractionsWithRelationsResponse = {
						data: [],
						total: totalCount,
						page,
						pageSize,
					};
					return c.json(emptyResponse);
				}

				// Extract interaction IDs for subsequent queries
				const interactionIds = interactions.map((i) => i.id);

				// Queries 3, 4, 5, 6: Load ALL related data in parallel
				const [allRatings, allFlags, allBigfiles, allSkillsAssessments] = await Promise.all([
					// Query 3: Load ALL ratings for these interactions
					db
						.select()
						.from(schema.ratings)
						.where(inArray(schema.ratings.interactionId, interactionIds)),
					// Query 4: Load ALL flags for these interactions
					db
						.select()
						.from(schema.flags)
						.where(inArray(schema.flags.interactionId, interactionIds)),
					// Query 5: Load ALL bigfiles for these interactions
					db
						.select()
						.from(schema.bigfiles)
						.where(inArray(schema.bigfiles.interactionId, interactionIds)),
					// Query 6: Load ALL skills assessments for these interactions
					db
						.select()
						.from(schema.skillsAssessments)
						.where(inArray(schema.skillsAssessments.interactionId, interactionIds)),
				]);

				// Group related data by interactionId
				const ratingsByInteraction = new Map<number, typeof allRatings>();
				const flagsByInteraction = new Map<number, typeof allFlags>();
				const bigfilesByInteraction = new Map<number, typeof allBigfiles>();
				const skillsAssessmentsByInteraction = new Map<number, typeof allSkillsAssessments>();

				// Initialize empty arrays for each interaction
				for (const interactionId of interactionIds) {
					ratingsByInteraction.set(interactionId, []);
					flagsByInteraction.set(interactionId, []);
					bigfilesByInteraction.set(interactionId, []);
					skillsAssessmentsByInteraction.set(interactionId, []);
				}

				// Group ratings
				for (const rating of allRatings) {
					const existing = ratingsByInteraction.get(rating.interactionId) ?? [];
					existing.push(rating);
					ratingsByInteraction.set(rating.interactionId, existing);
				}

				// Group flags (handle nullable interactionId)
				for (const flag of allFlags) {
					if (flag.interactionId !== null) {
						const existing = flagsByInteraction.get(flag.interactionId) ?? [];
						existing.push(flag);
						flagsByInteraction.set(flag.interactionId, existing);
					}
				}

				// Group bigfiles (handle nullable interactionId)
				for (const bigfile of allBigfiles) {
					if (bigfile.interactionId !== null) {
						const existing = bigfilesByInteraction.get(bigfile.interactionId) ?? [];
						existing.push(bigfile);
						bigfilesByInteraction.set(bigfile.interactionId, existing);
					}
				}

				// Group skills assessments
				for (const skillsAssessment of allSkillsAssessments) {
					const existing = skillsAssessmentsByInteraction.get(skillsAssessment.interactionId) ?? [];
					existing.push(skillsAssessment);
					skillsAssessmentsByInteraction.set(skillsAssessment.interactionId, existing);
				}

				// Merge related data into interaction objects
				const data: InteractionWithRelations[] = interactions.map((interaction) => ({
					...interaction,
					ratings: ratingsByInteraction.get(interaction.id) ?? [],
					flags: flagsByInteraction.get(interaction.id) ?? [],
					bigfiles: bigfilesByInteraction.get(interaction.id) ?? [],
					skillsAssessments: skillsAssessmentsByInteraction.get(interaction.id) ?? [],
				}));

				const response: InteractionsWithRelationsResponse = {
					data,
					total: totalCount,
					page,
					pageSize,
				};

				logger.info(
					{
						salespersonId,
						page,
						pageSize,
						totalInteractions: interactions.length,
						totalRatings: allRatings.length,
						totalFlags: allFlags.length,
						totalBigfiles: allBigfiles.length,
						totalSkillsAssessments: allSkillsAssessments.length,
					},
					"Loaded interactions with relations",
				);

				return c.json(response);
			} catch (error) {
				logger.error({ salespersonId, page, pageSize, error }, "Error loading interactions with relations");
				return c.json({ error: "Failed to load interactions" }, 500);
			}
		},
	)
	.post(
		"/:id/reset-analysis",
		zValidator("param", idSchema, (result, c) => {
			if (!result.success) {
				logger.warn({ issues: result.error.issues }, "Parameter validation failed");
				return c.json({ error: "Invalid interaction ID" }, 400);
			}
		}),
		async (c) => {
			const { id } = c.req.valid("param");

			try {
				let mode: "re-transcribe" | "re-analyze" = "re-transcribe";

				await db.transaction(async (tx) => {
					// Verify interaction exists and check for source file
					const [interactionResult, bigfileResult] = await Promise.all([
						tx.select().from(schema.interactions).where(eq(schema.interactions.id, id)).limit(1),
						tx.select().from(schema.bigfiles).where(eq(schema.bigfiles.interactionId, id)).limit(1),
					]);

					if (interactionResult.length === 0) {
						throw new Error("Interaction not found");
					}

					const interaction = interactionResult[0];
					const hasSourceFile = bigfileResult.length > 0;
					const hasTranscript = !!interaction.v1_raw_google_diarized;

					// Delete existing analysis data
					await tx.delete(schema.ratings).where(eq(schema.ratings.interactionId, id));
					await tx.delete(schema.flags).where(eq(schema.flags.interactionId, id));
					await tx.delete(schema.skillsAssessments).where(eq(schema.skillsAssessments.interactionId, id));
					await tx.delete(schema.callPersonas).where(eq(schema.callPersonas.interactionId, id));

					if (hasSourceFile) {
						// Has source file: clear transcript and re-transcribe from scratch
						mode = "re-transcribe";
						await tx
							.update(schema.interactions)
							.set({
								metadata: null,
								v1_raw_google_diarized: null,
								processedStatus: "unprocessed",
							})
							.where(eq(schema.interactions.id, id));
						logger.info({ interactionId: id }, "Reset analysis - will re-transcribe from source file");
					} else if (hasTranscript) {
						// Has transcript but no source file: keep transcript, just re-analyze
						mode = "re-analyze";
						await tx
							.update(schema.interactions)
							.set({
								metadata: null,
								notes: null,
								processedStatus: "processed", // "processed" + no ratings = picked up for analysis
							})
							.where(eq(schema.interactions.id, id));
						logger.info({ interactionId: id }, "Reset analysis - will re-analyze existing transcript (no source file)");
					} else {
						// No source file AND no transcript - nothing we can do
						throw new Error("Cannot reset: interaction has no source file and no transcript");
					}
				});

				const message =
					mode === "re-transcribe"
						? "Analysis reset. Will re-transcribe and analyze from source file."
						: "Analysis reset. Will re-analyze existing transcript.";

				return c.json({ success: true, message, mode });
			} catch (error) {
				logger.error({ interactionId: id, error }, "Error resetting interaction analysis");

				if (error instanceof Error && error.message === "Interaction not found") {
					return c.json({ error: "Interaction not found" }, 404);
				}
				if (error instanceof Error && error.message.startsWith("Cannot reset:")) {
					return c.json({ error: error.message }, 400);
				}

				return c.json({ error: "Failed to reset analysis" }, 500);
			}
		},
	)
	.delete(
		"/:id",
		zValidator("param", idSchema, (result, c) => {
			if (!result.success) {
				logger.warn({ issues: result.error.issues }, "Parameter validation failed");
				return c.json({ error: "Invalid interaction ID" }, 400);
			}
		}),
		async (c) => {
			const { id } = c.req.valid("param");

			try {
				await db.transaction(async (tx) => {
					// Verify interaction exists
					const interaction = await tx.select().from(schema.interactions).where(eq(schema.interactions.id, id)).limit(1);

					if (interaction.length === 0) {
						throw new Error("Interaction not found");
					}

					// Delete related data first (due to foreign key constraints)
					// Delete ratings
					await tx.delete(schema.ratings).where(eq(schema.ratings.interactionId, id));
					// Delete flags
					await tx.delete(schema.flags).where(eq(schema.flags.interactionId, id));
					// Delete skills assessments
					await tx.delete(schema.skillsAssessments).where(eq(schema.skillsAssessments.interactionId, id));
					// Delete extraction data (objections and pain points)
					await tx.delete(schema.interactionObjections).where(eq(schema.interactionObjections.interactionId, id));
					await tx.delete(schema.interactionPainPoints).where(eq(schema.interactionPainPoints.interactionId, id));
					// Delete bigfiles
					await tx.delete(schema.bigfiles).where(eq(schema.bigfiles.interactionId, id));
					// Finally delete the interaction
					await tx.delete(schema.interactions).where(eq(schema.interactions.id, id));

					logger.info({ interactionId: id }, "Deleted interaction and all related data");
				});

				return c.json({ success: true, message: "Interaction deleted successfully." });
			} catch (error) {
				logger.error({ interactionId: id, error }, "Error deleting interaction");

				if (error instanceof Error && error.message === "Interaction not found") {
					return c.json({ error: "Interaction not found" }, 404);
				}

				return c.json({ error: "Failed to delete interaction" }, 500);
			}
		},
	);

export default app;
