import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { db } from "#/data";
import { eq } from "drizzle-orm";
import * as schema from "#/data/schema";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { runCalibration, getCalibrationStatus } from "#/services/CalibrationService";
import { AgenticFeatureOrchestrationService } from "#/services/AgenticFeatureOrchestrationService";

const companyTrainingSchema = z.object({
	onboardingDocument: z.string().nullable().optional(),
	// Example call transcripts (note: these should be highlights/summaries, not full hour-long transcripts!)
	exampleGoodCall: z.string().nullable().optional(),
	exampleBadCall: z.string().nullable().optional(),
	exampleAverageCall: z.string().nullable().optional(),
	idealResponses: z
		.record(
			z.string(),
			z.object({
				ideal_response: z.string(),
				key_points: z.array(z.string()),
			}),
		)
		.nullable()
		.optional(),
	objectionHandlingGuide: z
		.record(
			z.string(),
			z.object({
				response_strategy: z.string(),
				examples: z.array(z.string()),
			}),
		)
		.nullable()
		.optional(),
	productPositioning: z.string().nullable().optional(),
	competitorInfo: z
		.record(
			z.string(),
			z.object({
				strengths: z.array(z.string()),
				weaknesses: z.array(z.string()),
				positioning: z.string(),
			}),
		)
		.nullable()
		.optional(),
	companyValues: z.array(z.string()).nullable().optional(),
	targetCustomerProfile: z.string().nullable().optional(),
	salesMethodology: z.string().nullable().optional(),
	companyFaq: z.string().nullable().optional(),
});

const app = new Hono<AuthVariable<false>>()
	// GET /api/admin/company-training/:companyId
	.get("/:companyId", async (c) => {
		const companyId = Number.parseInt(c.req.param("companyId"), 10);

		if (Number.isNaN(companyId)) {
			return c.json({ error: "Invalid company ID" }, 400);
		}

		const trainingData = await db
			.select()
			.from(schema.companyTrainingData)
			.where(eq(schema.companyTrainingData.companyId, companyId))
			.limit(1);

		if (trainingData.length === 0) {
			return c.json({ error: "Training data not found" }, 404);
		}

		return c.json(trainingData[0]);
	})

	// PUT /api/admin/company-training/:companyId - Create or update
	.put("/:companyId", zValidator("json", companyTrainingSchema), async (c) => {
		const companyId = Number.parseInt(c.req.param("companyId"), 10);
		const data = c.req.valid("json");

		if (Number.isNaN(companyId)) {
			return c.json({ error: "Invalid company ID" }, 400);
		}

		// Check if company exists
		const company = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);

		if (company.length === 0) {
			return c.json({ error: "Company not found" }, 404);
		}

		// Check if training data already exists
		const existing = await db.select().from(schema.companyTrainingData).where(eq(schema.companyTrainingData.companyId, companyId)).limit(1);

		const result =
			existing.length > 0
				? await db
						.update(schema.companyTrainingData)
						.set({
							...data,
							updatedAt: new Date(),
						})
						.where(eq(schema.companyTrainingData.companyId, companyId))
						.returning()
				: await db
						.insert(schema.companyTrainingData)
						.values({
							companyId,
							...data,
						})
						.returning();

		return c.json(result[0]);
	})

	// GET /api/admin/company-training/:companyId/calibration-status
	.get("/:companyId/calibration-status", async (c) => {
		const companyId = Number.parseInt(c.req.param("companyId"), 10);

		if (Number.isNaN(companyId)) {
			return c.json({ error: "Invalid company ID" }, 400);
		}

		const status = await getCalibrationStatus(companyId);
		return c.json(status);
	})

	// POST /api/admin/company-training/:companyId/calibrate
	// Run calibration to extract patterns from example calls
	.post("/:companyId/calibrate", async (c) => {
		const companyId = Number.parseInt(c.req.param("companyId"), 10);

		if (Number.isNaN(companyId)) {
			return c.json({ error: "Invalid company ID" }, 400);
		}

		// Get the example calls from company training data
		const trainingData = await db
			.select()
			.from(schema.companyTrainingData)
			.where(eq(schema.companyTrainingData.companyId, companyId))
			.limit(1);

		if (trainingData.length === 0) {
			return c.json({ error: "No training data found. Please add example calls first." }, 404);
		}

		const { exampleGoodCall, exampleBadCall, exampleAverageCall } = trainingData[0];

		if (!exampleGoodCall && !exampleBadCall && !exampleAverageCall) {
			return c.json({ error: "No example calls found. Please add at least one example call." }, 400);
		}

		const agentic = ["1", "true", "yes"].includes(String(c.req.query("agentic") ?? "").toLowerCase());
		const maxIterationsRaw = c.req.query("maxIterations");
		const maxIterations = maxIterationsRaw ? Math.min(20, Math.max(3, Number.parseInt(String(maxIterationsRaw), 10))) : 10;

		// Run calibration
		const result = agentic
			? ((await AgenticFeatureOrchestrationService.run({
					feature: "calibration_run",
					input: {
						companyId,
						goodCall: exampleGoodCall ?? undefined,
						averageCall: exampleAverageCall ?? undefined,
						badCall: exampleBadCall ?? undefined,
					},
					ctx: {
						workflowStateId: 0,
						workflowType: "feature",
						workflowId: "calibration_run",
						metadata: { userId: null, companyId },
					},
					config: { budgets: { maxIterations } } as any,
				})).output as any)
			: await runCalibration({
					companyId,
					goodCall: exampleGoodCall ?? undefined,
					averageCall: exampleAverageCall ?? undefined,
					badCall: exampleBadCall ?? undefined,
				});

		if (!result.success) {
			return c.json({ error: result.error, patternsExtracted: result.patternsExtracted }, 500);
		}

		return c.json({
			message: "Calibration complete",
			patternsExtracted: result.patternsExtracted,
		});
	});

export default app;
export type CompanyTrainingRoutes = typeof app;
