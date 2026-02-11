import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "#/middleware/auth";
import { getUserCompanyId } from "#/middleware/authorization";
import { idParamSchema } from "#/lib/validation";
import {
	getActiveBattleCards,
	getBattleCardWithScenario,
	generateBattleCardFromObjection,
	generateBattleCardFromPainPoint,
	generateTrainingScenario,
	saveBattleCard,
	saveTrainingScenario,
} from "#/services/BattleCardGenerationService";
import { generateWeeklyInsightsWithBattleCards } from "#/services/InsightsAggregationService";
import { AgenticFeatureOrchestrationService } from "#/services/AgenticFeatureOrchestrationService";

// Validation schemas

const generateBattleCardsSchema = z.object({
	week: z.string().optional(), // ISO date string for any date in the week
});

const updateBattleCardSchema = z.object({
	strategy: z.string().optional(),
	approach: z.array(z.string()).optional(),
	script: z.string().optional(),
	nextStep: z.string().optional(),
	isActive: z.boolean().optional(),
	status: z.enum(["draft", "active", "archived"]).optional(),
});

const app = new Hono<AuthVariable<false>>()
	// Get all active battle cards for user's company
	.get("/", requireAuth, async (c) => {
		const currentUser = c.get("user");
		const companyId = await getUserCompanyId(currentUser.id);

		if (!companyId) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		const battleCards = await getActiveBattleCards(companyId);

		return c.json(battleCards);
	})

	// Get single battle card with linked training scenario
	.get("/:id", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const currentUser = c.get("user");
		const companyId = await getUserCompanyId(currentUser.id);

		if (!companyId) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		const result = await getBattleCardWithScenario(id);

		if (!result) {
			return c.json({ error: "Battle card not found" }, 404);
		}

		// Verify user has access to this battle card
		if (result.battleCard.companyId !== companyId) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		return c.json(result);
	})

	// Generate battle cards from weekly insights
	// This triggers Phase 2: aggregation + battle card generation
	.post("/generate", requireAuth, zValidator("json", generateBattleCardsSchema), async (c) => {
		const currentUser = c.get("user");
		const companyId = await getUserCompanyId(currentUser.id);

		if (!companyId) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		const { week } = c.req.valid("json");
		const weekDate = week ? new Date(week) : new Date();

		const agentic = ["1", "true", "yes"].includes(String(c.req.query("agentic") ?? "").toLowerCase());
		const maxIterationsRaw = c.req.query("maxIterations");
		const maxIterations = maxIterationsRaw ? Math.min(20, Math.max(3, Number.parseInt(String(maxIterationsRaw), 10))) : 10;

		// Generate insights with battle cards
		const insights = agentic
			? ((await AgenticFeatureOrchestrationService.run({
					feature: "battle_cards_weekly_generate",
					input: { companyId, weekDateIso: weekDate.toISOString(), generateBattleCards: true },
					ctx: {
						workflowStateId: 0,
						workflowType: "feature",
						workflowId: "battle_cards_weekly_generate",
						metadata: { userId: currentUser.id, companyId },
					},
					config: { budgets: { maxIterations } } as any,
				})).output as any)
			: await generateWeeklyInsightsWithBattleCards(companyId, weekDate, true);

		return c.json({
			message: "Battle cards generated successfully",
			insights: {
				weekStart: insights.weekStart,
				weekEnd: insights.weekEnd,
				totalCallsAnalyzed: insights.totalCallsAnalyzed,
				topObjectionsCount: insights.topObjections.length,
				topPainPointsCount: insights.topProspectPainPoints.length + insights.topRepPainPoints.length,
			},
			battleCardIds: insights.battleCardIds,
			scenarioIds: insights.scenarioIds,
		});
	})

	// Update battle card (for editing by managers)
	.patch("/:id", requireAuth, zValidator("param", idParamSchema), zValidator("json", updateBattleCardSchema), async (c) => {
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const currentUser = c.get("user");
		const companyId = await getUserCompanyId(currentUser.id);

		if (!companyId) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		// Verify battle card exists and user has access
		const [existing] = await db.select().from(schema.battleCards).where(eq(schema.battleCards.id, id)).limit(1);

		if (!existing) {
			return c.json({ error: "Battle card not found" }, 404);
		}

		if (existing.companyId !== companyId) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		// Track changes for AI learning (battle_card_improvements context)
		const changes: Array<{ field: string; originalValue: string; newValue: string }> = [];
		if (body.strategy !== undefined && body.strategy !== existing.strategy) {
			changes.push({ field: "strategy", originalValue: existing.strategy, newValue: body.strategy });
		}
		if (body.approach !== undefined && JSON.stringify(body.approach) !== JSON.stringify(existing.approach)) {
			changes.push({ field: "approach", originalValue: (existing.approach ?? []).join(", "), newValue: body.approach.join(", ") });
		}
		if (body.script !== undefined && body.script !== existing.script) {
			changes.push({ field: "script", originalValue: existing.script, newValue: body.script });
		}
		if (body.nextStep !== undefined && body.nextStep !== existing.nextStep) {
			changes.push({ field: "nextStep", originalValue: existing.nextStep, newValue: body.nextStep });
		}

		// Update only allowed fields
		const updateData: Partial<typeof schema.battleCards.$inferInsert> = {};
		if (body.strategy !== undefined) updateData.strategy = body.strategy;
		if (body.approach !== undefined) updateData.approach = body.approach;
		if (body.script !== undefined) updateData.script = body.script;
		if (body.nextStep !== undefined) updateData.nextStep = body.nextStep;
		if (body.isActive !== undefined) updateData.isActive = body.isActive;
		if (body.status !== undefined) updateData.status = body.status;

		updateData.updatedAt = new Date();

		const [updated] = await db.update(schema.battleCards).set(updateData).where(eq(schema.battleCards.id, id)).returning();

		// Record feedback events for content changes (helps AI learn manager preferences)
		if (changes.length > 0) {
			await db.insert(schema.feedbackEvents).values(
				changes.map((change) => ({
					companyId,
					eventType: "battle_card_edit" as const,
					sourceId: id,
					sourceType: "battle_card" as const,
					data: {
						battleCardTitle: existing.title,
						fieldChanged: change.field,
						originalValue: change.originalValue,
						newValue: change.newValue,
					},
					context: {
						battleCardId: id,
						phase: existing.phase,
						challenge: existing.challenge,
					},
					userId: currentUser.id,
				})),
			);
		}

		return c.json(updated);
	})

	// Archive a battle card
	.delete("/:id", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const currentUser = c.get("user");
		const companyId = await getUserCompanyId(currentUser.id);

		if (!companyId) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		// Verify battle card exists and user has access
		const [existing] = await db.select().from(schema.battleCards).where(eq(schema.battleCards.id, id)).limit(1);

		if (!existing) {
			return c.json({ error: "Battle card not found" }, 404);
		}

		if (existing.companyId !== companyId) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		// Soft delete - mark as archived and inactive
		const [archived] = await db
			.update(schema.battleCards)
			.set({
				status: "archived",
				isActive: false,
				updatedAt: new Date(),
			})
			.where(eq(schema.battleCards.id, id))
			.returning();

		return c.json(archived);
	})

	// Backfill training scenarios for all battle cards that don't have them
	.post("/backfill-scenarios", requireAuth, async (c) => {
		const currentUser = c.get("user");
		const companyId = await getUserCompanyId(currentUser.id);

		if (!companyId) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		// Find all battle cards without linked scenarios for this company
		const battleCardsWithoutScenarios = await db
			.select()
			.from(schema.battleCards)
			.where(and(eq(schema.battleCards.companyId, companyId), eq(schema.battleCards.isActive, true)))
			.orderBy(desc(schema.battleCards.impactScore));

		const results: { battleCardId: number; scenarioId: number; title: string }[] = [];
		const errors: { battleCardId: number; title: string; error: string }[] = [];

		for (const battleCard of battleCardsWithoutScenarios) {
			// Skip if already has a scenario
			if (battleCard.linkedScenarioId) {
				continue;
			}

			try {
				const battleCardContent = {
					title: battleCard.title,
					challenge: battleCard.challenge,
					phase: battleCard.phase as "outreach" | "discovery" | "demo" | "close",
					strategy: battleCard.strategy,
					approach: battleCard.approach as string[],
					script: battleCard.script,
					nextStep: battleCard.nextStep,
				};

				const sourceType = (battleCard.sourceType as "objection" | "pain_point") ?? "objection";
				const scenarioContent = await generateTrainingScenario(battleCardContent, sourceType);
				const skillKey = sourceType === "objection" ? "objection_handling" : "general_sales";
				const scenarioId = await saveTrainingScenario(battleCard.id, scenarioContent, skillKey);

				results.push({ battleCardId: battleCard.id, scenarioId, title: battleCard.title });
			} catch (error) {
				errors.push({
					battleCardId: battleCard.id,
					title: battleCard.title,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		return c.json({
			message: `Generated ${results.length} training scenarios`,
			generated: results,
			errors: errors.length > 0 ? errors : undefined,
			totalBattleCards: battleCardsWithoutScenarios.length,
			alreadyHadScenarios: battleCardsWithoutScenarios.length - results.length - errors.length,
		});
	})

	// Start training for a battle card (creates/returns the linked scenario)
	.post("/:id/train", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const currentUser = c.get("user");
		const companyId = await getUserCompanyId(currentUser.id);

		if (!companyId) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		const result = await getBattleCardWithScenario(id);

		if (!result) {
			return c.json({ error: "Battle card not found" }, 404);
		}

		if (result.battleCard.companyId !== companyId) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		// If scenario already exists, return it
		if (result.scenario) {
			return c.json({
				battleCard: result.battleCard,
				scenario: result.scenario,
			});
		}

		// Generate a new scenario for this battle card
		const battleCardContent = {
			title: result.battleCard.title,
			challenge: result.battleCard.challenge,
			phase: result.battleCard.phase,
			strategy: result.battleCard.strategy,
			approach: result.battleCard.approach as string[],
			script: result.battleCard.script,
			nextStep: result.battleCard.nextStep,
		};

		const sourceType = result.battleCard.sourceType as "objection" | "pain_point";

		const scenarioContent = await generateTrainingScenario(battleCardContent, sourceType);
		const skillKey = sourceType === "objection" ? "objection_handling" : "general_sales";
		const scenarioId = await saveTrainingScenario(id, scenarioContent, skillKey);

		// Fetch the created scenario
		const [newScenario] = await db.select().from(schema.trainingScenarios).where(eq(schema.trainingScenarios.id, scenarioId)).limit(1);

		return c.json({
			battleCard: result.battleCard,
			scenario: newScenario,
		});
	});

export default app;
