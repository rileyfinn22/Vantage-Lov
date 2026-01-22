import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { FeedbackAggregationService } from "#/services/FeedbackAggregationService";

const app = new Hono<AuthVariable<false>>()
	/**
	 * POST /api/admin/feedback-aggregation/aggregate/:companyId
	 * Trigger feedback aggregation for a specific company
	 */
	.post(
		"/aggregate/:companyId",
		zValidator(
			"param",
			z.object({
				companyId: z.string().transform(Number),
			}),
		),
		async (c) => {
			const { companyId } = c.req.valid("param");

			try {
				await FeedbackAggregationService.aggregateCompanyFeedback(companyId);
				return c.json({
					success: true,
					message: `Feedback aggregation completed for company ${companyId}`,
				});
			} catch (error) {
				console.error(`[API] Error aggregating feedback for company ${companyId}:`, error);
				return c.json(
					{
						success: false,
						error: "Failed to aggregate feedback",
						details: error instanceof Error ? error.message : String(error),
					},
					500,
				);
			}
		},
	)

	/**
	 * POST /api/admin/feedback-aggregation/aggregate-all
	 * Trigger feedback aggregation for all companies
	 */
	.post("/aggregate-all", async (c) => {
		try {
			await FeedbackAggregationService.aggregateAllCompanies();
			return c.json({
				success: true,
				message: "Feedback aggregation completed for all companies",
			});
		} catch (error) {
			console.error("[API] Error aggregating feedback for all companies:", error);
			return c.json(
				{
					success: false,
					error: "Failed to aggregate feedback",
					details: error instanceof Error ? error.message : String(error),
				},
				500,
			);
		}
	});

export default app;
export type FeedbackAggregationRoutes = typeof app;
