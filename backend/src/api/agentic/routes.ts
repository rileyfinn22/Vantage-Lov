import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "#/middleware/auth";
import { AgenticFeatureOrchestrationService } from "#/services/AgenticFeatureOrchestrationService";

const runInteractionSchema = z.object({
	interactionId: z.coerce.number().int().min(1),
	maxIterations: z.coerce.number().int().min(3).max(20).optional(),
});

export default new Hono<AuthVariable<false>>()
	.post(
		"/interaction/pipeline",
		requireAuth,
		zValidator("json", runInteractionSchema),
		async (c) => {
			const currentUser = c.get("user");
			const body = c.req.valid("json");
			const { output, trace } = await AgenticFeatureOrchestrationService.run({
				feature: "interaction_branched_pipeline",
				input: { interactionId: body.interactionId },
				ctx: { userId: currentUser.id } as any,
				config: { budgets: { maxIterations: body.maxIterations ?? 10, maxToolCalls: 12, maxTimeMs: 120_000 } },
			});
			return c.json({ output, trace });
		},
	);
