import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { insightsData, markNotificationRead, dismissNotification } from "#/vantage/insights";
import { generateWeeklyInsights, generateInsightsForRange } from "#/services/InsightsAggregationService";
import { autoGenerateBattleCardsForCompany } from "#/services/BattleCardGenerationService";
import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq } from "drizzle-orm";
import { logger } from "#/lib/logger";
import { requireAuth } from "#/middleware/auth";
import { idParamSchema } from "#/lib/validation";

// Zod validation schemas

const weeklyQuerySchema = z.object({
	week: z.string().optional(), // ISO date string for any date in the week
});

const rangeQuerySchema = z.object({
	startDate: z.string(), // ISO date string
	endDate: z.string(), // ISO date string
});

const app = new Hono<AuthVariable<false>>()
	// Get all insights data (main endpoint like dashboard)
	// Also triggers auto-generation of battle cards for top items if they don't exist
	.get("/", requireAuth, async (c) => {
		const currentUser = c.get("user");
		const insights = await insightsData(currentUser.id);

		// Trigger auto-generation of battle cards in the background
		// This checks if battle cards exist for the top objections/pain points and generates them if not
		if (insights.objections.length > 0 || insights.prospectPainPoints.length > 0) {
			// Get user's company ID
			const salesperson = await db
				.select({ companyId: schema.salespeople.companyId })
				.from(schema.salespeople)
				.where(eq(schema.salespeople.associatedUserId, currentUser.id))
				.limit(1);

			if (salesperson.length > 0) {
				const companyId = salesperson[0].companyId;
				// Run in background - don't block the response
				autoGenerateBattleCardsForCompany(companyId).catch((error) => {
					logger.error({ error, companyId }, "Failed to auto-generate battle cards");
				});
			}
		}

		return c.json(insights);
	})

	// Mark notification as read
	.patch("/notifications/:id/read", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const notificationId = c.req.valid("param").id;
		const currentUser = c.get("user");

		const updatedNotification = await markNotificationRead(notificationId, currentUser.id);

		if (!updatedNotification) {
			return c.json({ error: "Notification not found or unauthorized" }, 404);
		}

		return c.json(updatedNotification);
	})

	// Dismiss notification
	.patch("/notifications/:id/dismiss", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const notificationId = c.req.valid("param").id;
		const currentUser = c.get("user");

		const updatedNotification = await dismissNotification(notificationId, currentUser.id);

		if (!updatedNotification) {
			return c.json({ error: "Notification not found or unauthorized" }, 404);
		}

		return c.json(updatedNotification);
	})

	// Get weekly aggregated insights (Phase 2)
	// Returns top 3 objections and pain points with impact scores
	.get("/weekly", requireAuth, zValidator("query", weeklyQuerySchema), async (c) => {
		const currentUser = c.get("user");
		const { week } = c.req.valid("query");

		// Get user's company
		const salesperson = await db
			.select({ companyId: schema.salespeople.companyId })
			.from(schema.salespeople)
			.where(eq(schema.salespeople.associatedUserId, currentUser.id))
			.limit(1);

		if (!salesperson.length) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		const weekDate = week ? new Date(week) : new Date();
		const insights = await generateWeeklyInsights(salesperson[0].companyId, weekDate);

		return c.json(insights);
	})

	// Get insights for a custom date range
	.get("/range", requireAuth, zValidator("query", rangeQuerySchema), async (c) => {
		const currentUser = c.get("user");
		const { startDate, endDate } = c.req.valid("query");

		// Get user's company
		const salesperson = await db
			.select({ companyId: schema.salespeople.companyId })
			.from(schema.salespeople)
			.where(eq(schema.salespeople.associatedUserId, currentUser.id))
			.limit(1);

		if (!salesperson.length) {
			return c.json({ error: "User not associated with a company" }, 400);
		}

		const insights = await generateInsightsForRange(salesperson[0].companyId, new Date(startDate), new Date(endDate));

		return c.json(insights);
	});

export default app;
