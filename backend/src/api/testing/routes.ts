import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "#/data";
import { eq } from "drizzle-orm";
import * as schema from "#/data/schema";
import {
	loadAnalysisPrompts,
	runBranchedAnalysis,
	type AnalysisPromptPack,
} from "#/services/InteractionProcessingService";

const analyzeTranscriptSchema = z.object({
	transcript: z.string().min(50, "Transcript must be at least 50 characters"),
	companyContext: z.string().optional(),
	promptOverrides: z
		.object({
			rating: z.string().optional(),
			flagging: z.string().optional(),
			extraction: z.string().optional(),
			persona: z.string().optional(),
		})
		.optional(),
});

export default new Hono<AuthVariable<false>>()
	// Admin middleware - require site admin role
	.use("*", async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const userRoles = await db
			.select()
			.from(schema.authUserRoles)
			.where(eq(schema.authUserRoles.userId, currentUser.id));
		const isSiteAdmin = userRoles.some((role) => role.role === "admin");

		if (!isSiteAdmin) {
			return c.json({ error: "Forbidden: Site admin access required" }, 403);
		}

		return next();
	})
	.get("/prompts", async (c) => {
		const prompts = await loadAnalysisPrompts();
		return c.json({
			rating: prompts.ratingPromptText,
			flagging: prompts.flaggingPromptText,
			extraction: prompts.extractionPromptText,
			persona: prompts.personaPromptText,
		});
	})
	.post(
		"/analyze-transcript",
		zValidator("json", analyzeTranscriptSchema),
		async (c) => {
			const body = c.req.valid("json");
			const startTime = Date.now();

			// Load default prompts
			const defaultPrompts = await loadAnalysisPrompts();

			// Apply any overrides
			const prompts: AnalysisPromptPack = {
				ratingPromptText: body.promptOverrides?.rating ?? defaultPrompts.ratingPromptText,
				flaggingPromptText: body.promptOverrides?.flagging ?? defaultPrompts.flaggingPromptText,
				extractionPromptText: body.promptOverrides?.extraction ?? defaultPrompts.extractionPromptText,
				personaPromptText: body.promptOverrides?.persona ?? defaultPrompts.personaPromptText,
			};

			// Run analysis (no DB persistence)
			const result = await runBranchedAnalysis({
				interactionId: 0, // dummy - not persisting
				textToAnalyze: body.transcript,
				companyContextFormatted: body.companyContext,
				prompts,
			});

			const totalTime = Date.now() - startTime;

			return c.json({
				result,
				timing: {
					totalMs: totalTime,
					totalSeconds: (totalTime / 1000).toFixed(2),
				},
			});
		},
	);
