import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as schema from "#/data/schema";
import { db } from "#/data";
import { eq, sql, and, isNull, isNotNull, desc } from "drizzle-orm";
import { paginationQuerySchema, calculateOffset, createPaginationMetadata, type PaginationMetadata } from "#/validators/pagination";
import { checkSalespersonAccess, getUserCompanyId } from "#/middleware/authorization";
import { requireAuth } from "#/middleware/auth";
import { FeedbackAggregationService } from "#/services/FeedbackAggregationService";
import { logger } from "#/lib/logger";

/**
 * Debounced feedback aggregation trigger.
 * When feedback is submitted, we queue aggregation for the company
 * but debounce to avoid running too frequently.
 */
const pendingAggregations = new Map<number, NodeJS.Timeout>();
const AGGREGATION_DEBOUNCE_MS = 60_000; // 1 minute debounce

function scheduleAggregation(companyId: number): void {
	// Clear any existing pending aggregation for this company
	const existing = pendingAggregations.get(companyId);
	if (existing) {
		clearTimeout(existing);
	}

	// Schedule new aggregation
	const timeout = setTimeout(async () => {
		pendingAggregations.delete(companyId);
		try {
			logger.info({ companyId }, "Running debounced feedback aggregation");
			await FeedbackAggregationService.aggregateCompanyFeedback(companyId);
		} catch (error) {
			logger.error({ error, companyId }, "Failed to run debounced feedback aggregation");
		}
	}, AGGREGATION_DEBOUNCE_MS);

	pendingAggregations.set(companyId, timeout);
}

// Zod validation schemas
const flagsQuerySchema = z
	.object({
		salespersonId: z.coerce.number().int().positive(),
	})
	.merge(paginationQuerySchema);

const flagRatingSchema = z.object({
	rating: z.number().int().min(1).max(10),
});

const managerReviewSchema = z.object({
	approved: z.boolean(),
	managerNotes: z.string().optional(),
	adjustedBetterResponse: z.string().optional(),
	adjustedWhyMatters: z.string().optional(),
	isGoodFlag: z.boolean(),
});

const app = new Hono<AuthVariable<false>>()
	.get("/", requireAuth, zValidator("query", flagsQuerySchema), async (c) => {
		const currentUser = c.get("user");
		const { salespersonId, page, pageSize } = c.req.valid("query");

		// Check if salesperson exists
		const salesperson = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, salespersonId)).limit(1);

		if (salesperson.length === 0) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check authorization
		const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson[0]);
		if (!hasAccess) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Get total count (only incomplete flags)
		const totalResult = await db
			.select()
			.from(schema.flags)
			.where(and(eq(schema.flags.associatedSalespersonId, salespersonId), eq(schema.flags.complete, false)));
		const total = totalResult.length;

		// Get paginated flags with interaction metadata for prospect info (only incomplete flags)
		const offset = calculateOffset(page, pageSize);
		const flagsWithInteractions = await db
			.select({
				flag: schema.flags,
				interactionMetadata: schema.interactions.metadata,
			})
			.from(schema.flags)
			.leftJoin(schema.interactions, eq(schema.flags.interactionId, schema.interactions.id))
			.where(and(eq(schema.flags.associatedSalespersonId, salespersonId), eq(schema.flags.complete, false)))
			.limit(pageSize)
			.offset(offset);

		// Transform to include prospect info at the top level of each flag
		const flags = flagsWithInteractions.map((row) => ({
			...row.flag,
			prospectName: row.interactionMetadata?.prospect?.name ?? null,
			prospectCompany: row.interactionMetadata?.prospect?.company ?? null,
		}));

		// Create pagination metadata
		const pagination: PaginationMetadata = createPaginationMetadata(page, pageSize, total);

		return c.json({
			flags,
			pagination,
		});
	})
	// POST /flags/:flagId/rate - Salespeople rate flag helpfulness (1-10)
	.post("/:flagId/rate", requireAuth, zValidator("json", flagRatingSchema), async (c) => {
		const currentUser = c.get("user");
		const flagId = Number.parseInt(c.req.param("flagId"), 10);
		const { rating } = c.req.valid("json");

		if (Number.isNaN(flagId)) {
			return c.json({ error: "Invalid flag ID" }, 400);
		}

		// Get flag and check access
		const flag = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId)).limit(1);

		if (flag.length === 0) {
			return c.json({ error: "Flag not found" }, 404);
		}

		// Check if user has access to this salesperson's flags
		const salesperson = await db
			.select()
			.from(schema.salespeople)
			.where(eq(schema.salespeople.id, flag[0].associatedSalespersonId))
			.limit(1);

		if (salesperson.length === 0) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson[0]);
		if (!hasAccess) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Update rating
		const updated = await db.update(schema.flags).set({ repRating: rating }).where(eq(schema.flags.id, flagId)).returning();

		// Trigger debounced feedback aggregation for this company
		scheduleAggregation(salesperson[0].companyId);

		return c.json({ success: true, flag: updated[0] });
	})
	// POST /flags/:flagId/review - Managers review and adjust flags
	.post("/:flagId/review", requireAuth, zValidator("json", managerReviewSchema), async (c) => {
		const currentUser = c.get("user");
		const flagId = Number.parseInt(c.req.param("flagId"), 10);
		const reviewData = c.req.valid("json");

		if (Number.isNaN(flagId)) {
			return c.json({ error: "Invalid flag ID" }, 400);
		}

		// Get flag
		const flag = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId)).limit(1);

		if (flag.length === 0) {
			return c.json({ error: "Flag not found" }, 404);
		}

		// Check if user is a manager/admin for this flag's company
		const salesperson = await db
			.select()
			.from(schema.salespeople)
			.where(eq(schema.salespeople.id, flag[0].associatedSalespersonId))
			.limit(1);

		if (salesperson.length === 0) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check if user is admin or company manager
		const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson[0]);
		if (!hasAccess) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Create manager review object
		const managerReview = {
			...reviewData,
			reviewedBy: currentUser.id,
			reviewedAt: new Date().toISOString(),
		};

		// Update flag with manager review
		const updated = await db.update(schema.flags).set({ managerReview }).where(eq(schema.flags.id, flagId)).returning();

		// Trigger debounced feedback aggregation for this company
		scheduleAggregation(salesperson[0].companyId);

		return c.json({ success: true, flag: updated[0] });
	})
	// POST /flags/:flagId/report-bad - Reps report a flag as incorrect/bad
	.post(
		"/:flagId/report-bad",
		requireAuth,
		zValidator(
			"json",
			z.object({
				reason: z.enum(["incorrect-flag", "outdated-technique", "poor-scoring", "wrong-context", "technical-issue", "other"]),
				details: z.string().min(10),
			}),
		),
		async (c) => {
			const currentUser = c.get("user");
			const flagId = Number.parseInt(c.req.param("flagId"), 10);
			const { reason, details } = c.req.valid("json");

			if (Number.isNaN(flagId)) {
				return c.json({ error: "Invalid flag ID" }, 400);
			}

			// Get flag and check access
			const flag = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId)).limit(1);

			if (flag.length === 0) {
				return c.json({ error: "Flag not found" }, 404);
			}

			// Check if user has access to this salesperson's flags
			const salesperson = await db
				.select()
				.from(schema.salespeople)
				.where(eq(schema.salespeople.id, flag[0].associatedSalespersonId))
				.limit(1);

			if (salesperson.length === 0) {
				return c.json({ error: "Salesperson not found" }, 404);
			}

			const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson[0]);
			if (!hasAccess) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Create bad flag report
			const badFlagReport = {
				reportedBy: currentUser.id,
				reportedAt: new Date().toISOString(),
				reason,
				details,
				status: "pending" as const,
			};

			// Update flag with bad flag report
			const updated = await db.update(schema.flags).set({ badFlagReport }).where(eq(schema.flags.id, flagId)).returning();

			// Trigger debounced feedback aggregation for this company
			scheduleAggregation(salesperson[0].companyId);

			return c.json({ success: true, flag: updated[0] });
		},
	)
	// POST /flags/:flagId/respond-report - Managers respond to bad flag reports
	.post(
		"/:flagId/respond-report",
		requireAuth,
		zValidator(
			"json",
			z.object({
				action: z.enum(["agree", "disagree"]),
				response: z.string(),
			}),
		),
		async (c) => {
			const currentUser = c.get("user");
			const flagId = Number.parseInt(c.req.param("flagId"), 10);
			const { action, response } = c.req.valid("json");

			if (Number.isNaN(flagId)) {
				return c.json({ error: "Invalid flag ID" }, 400);
			}

			// Get flag
			const flag = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId)).limit(1);

			if (flag.length === 0) {
				return c.json({ error: "Flag not found" }, 404);
			}

			// Check if flag has a bad flag report
			if (!flag[0].badFlagReport) {
				return c.json({ error: "No bad flag report found" }, 404);
			}

			// Check if user is a manager/admin for this flag's company
			const salesperson = await db
				.select()
				.from(schema.salespeople)
				.where(eq(schema.salespeople.id, flag[0].associatedSalespersonId))
				.limit(1);

			if (salesperson.length === 0) {
				return c.json({ error: "Salesperson not found" }, 404);
			}

			const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson[0]);
			if (!hasAccess) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Update bad flag report with manager response
			const updatedReport = {
				...flag[0].badFlagReport,
				status: action === "agree" ? ("resolved-agree" as const) : ("resolved-disagree" as const),
				managerResponse: response,
				managerAction: action,
				respondedAt: new Date().toISOString(),
			};

			const updated = await db.update(schema.flags).set({ badFlagReport: updatedReport }).where(eq(schema.flags.id, flagId)).returning();

			return c.json({ success: true, flag: updated[0] });
		},
	)
	// POST /flags/:flagId/coach-notes - Managers add coaching notes to weekly review flags
	.post(
		"/:flagId/coach-notes",
		requireAuth,
		zValidator(
			"json",
			z.object({
				coachNotes: z.string().min(10),
			}),
		),
		async (c) => {
			const currentUser = c.get("user");
			const flagId = Number.parseInt(c.req.param("flagId"), 10);
			const { coachNotes } = c.req.valid("json");

			if (Number.isNaN(flagId)) {
				return c.json({ error: "Invalid flag ID" }, 400);
			}

			// Get flag
			const flag = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId)).limit(1);

			if (flag.length === 0) {
				return c.json({ error: "Flag not found" }, 404);
			}

			// Check if user is a manager/admin for this flag's company
			const salesperson = await db
				.select()
				.from(schema.salespeople)
				.where(eq(schema.salespeople.id, flag[0].associatedSalespersonId))
				.limit(1);

			if (salesperson.length === 0) {
				return c.json({ error: "Salesperson not found" }, 404);
			}

			const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson[0]);
			if (!hasAccess) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Update weekly review status with coach notes
			const updatedReviewStatus = flag[0].weeklyReviewStatus
				? {
						...flag[0].weeklyReviewStatus,
						reviewedAt: new Date().toISOString(),
						coachNotes,
					}
				: {
						weekAssigned: "",
						assignedAt: new Date().toISOString(),
						reviewedAt: new Date().toISOString(),
						coachNotes,
					};

			const updated = await db
				.update(schema.flags)
				.set({ weeklyReviewStatus: updatedReviewStatus })
				.where(eq(schema.flags.id, flagId))
				.returning();

			return c.json({ success: true, flag: updated[0] });
		},
	)
	// GET /flags/manager/weekly-reviews - Get flags assigned for weekly manager review
	.get("/manager/weekly-reviews", requireAuth, async (c) => {
		const currentUser = c.get("user");

		const companyId = await getUserCompanyId(currentUser.id);
		if (!companyId) {
			return c.json({ flags: [] });
		}

		const rows = await db
			.select({ flag: schema.flags })
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), isNull(schema.flags.weeklyReviewStatus)))
			.orderBy(desc(schema.flags.createdAt))
			.limit(50);

		return c.json({ flags: rows.map((r) => r.flag) });
	})
	// GET /flags/manager/bad-reports - Get all reported bad flags for manager review
	.get("/manager/bad-reports", requireAuth, async (c) => {
		const currentUser = c.get("user");

		const companyId = await getUserCompanyId(currentUser.id);
		if (!companyId) {
			return c.json({ flags: [] });
		}

		const rows = await db
			.select({ flag: schema.flags })
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), isNotNull(schema.flags.badFlagReport)))
			.orderBy(desc(schema.flags.createdAt));

		return c.json({ flags: rows.map((r) => r.flag) });
	});

export default app;
