import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as schema from "#/data/schema";
import { db, computeRawInteractionText } from "#/data";
import { eq, and, gte, lt, sum, inArray } from "drizzle-orm";
import { flagDetailsData } from "#/vantage/training";
import { checkSalespersonAccess, getSalespersonForUserWithAdminFallback } from "#/middleware/authorization";
import { requireAuth } from "#/middleware/auth";
import { idParamSchema } from "#/lib/validation";
import {
	getSalespersonSkillTrends,
	getCurrentPeriodSummary,
	getSkillDistribution,
	getSkillCallDetails,
	type TimePeriod,
} from "./analytics";

// Zod validation schemas

const flagIdParamSchema = z.object({
	flagId: z.coerce.number().int().positive(),
});

const skillTrendsQuerySchema = z.object({
	period: z.enum(["week", "month", "quarter", "all"]).optional().default("month"),
	limit: z.coerce.number().int().min(1).max(52).optional().default(12),
});

const skillDistributionQuerySchema = z.object({
	skill: z.enum(["objection_handling", "pricing_discussions", "discovery", "closing"]),
});

export async function salesPersonData(params: { salespersonId?: number; userId?: string }) {
	const { salespersonId, userId } = params;

	if (!salespersonId && !userId) {
		throw new Error("Either salespersonId or userId must be provided");
	}

	if (salespersonId && userId) {
		throw new Error("Cannot specify both salespersonId and userId");
	}

	const whereCondition = salespersonId ? eq(schema.salespeople.id, salespersonId) : eq(schema.salespeople.associatedUserId, userId!);

	const result = await db
		.select()
		.from(schema.salespeople)
		.leftJoin(schema.companies, eq(schema.salespeople.companyId, schema.companies.id))
		.where(whereCondition);

	if (result.length === 0) {
		return null;
	}

	const salesperson = result[0].salespeople;
	const company = result[0].company;

	const actualSalespersonId = salesperson.id;

	// Get current date boundaries for MTD/QTD calculations
	const now = new Date();
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth();
	const currentQuarter = Math.floor(currentMonth / 3);

	// Month-to-date boundaries
	const monthStart = new Date(currentYear, currentMonth, 1);
	const monthEnd = new Date(currentYear, currentMonth + 1, 1);

	// Quarter-to-date boundaries
	const quarterStart = new Date(currentYear, currentQuarter * 3, 1);
	const quarterEnd = new Date(currentYear, (currentQuarter + 1) * 3, 1);

	// Fetch basic data
	const interactionsRaw = await db.select().from(schema.interactions).where(eq(schema.interactions.salespersonId, actualSalespersonId));

	// Fetch related data for all interactions in a single query
	const interactionIds = interactionsRaw.map((i) => i.id);
	const allFiles =
		interactionIds.length > 0 ? await db.select().from(schema.bigfiles).where(inArray(schema.bigfiles.interactionId, interactionIds)) : [];
	const allRatings =
		interactionIds.length > 0 ? await db.select().from(schema.ratings).where(inArray(schema.ratings.interactionId, interactionIds)) : [];
	const allSkills =
		interactionIds.length > 0
			? await db.select().from(schema.skillsAssessments).where(inArray(schema.skillsAssessments.interactionId, interactionIds))
			: [];

	// Group related data by interaction ID
	const filesByInteraction = new Map<number, typeof allFiles>();
	const ratingsByInteraction = new Map<number, typeof allRatings>();
	const skillsByInteraction = new Map<number, typeof allSkills>();

	for (const file of allFiles) {
		if (file.interactionId) {
			if (!filesByInteraction.has(file.interactionId)) {
				filesByInteraction.set(file.interactionId, []);
			}
			filesByInteraction.get(file.interactionId)!.push(file);
		}
	}

	for (const rating of allRatings) {
		if (!ratingsByInteraction.has(rating.interactionId)) {
			ratingsByInteraction.set(rating.interactionId, []);
		}
		ratingsByInteraction.get(rating.interactionId)!.push(rating);
	}

	for (const skill of allSkills) {
		if (skill.interactionId) {
			if (!skillsByInteraction.has(skill.interactionId)) {
				skillsByInteraction.set(skill.interactionId, []);
			}
			skillsByInteraction.get(skill.interactionId)!.push(skill);
		}
	}

	// Add computed rawInteractionText and related data to each interaction
	const interactions = interactionsRaw.map((interaction) => ({
		...interaction,
		rawInteractionText: computeRawInteractionText(interaction),
		files: filesByInteraction.get(interaction.id) ?? [],
		ratings: ratingsByInteraction.get(interaction.id) ?? [],
		skillsAssessments: skillsByInteraction.get(interaction.id) ?? [],
	}));
	const flags = await db.select().from(schema.flags).where(eq(schema.flags.associatedSalespersonId, actualSalespersonId));
	const revenue = await db.select().from(schema.revenue).where(eq(schema.revenue.associatedSalespersonId, actualSalespersonId));

	// Calculate MTD revenue
	const mtdRevenue = await db
		.select({ total: sum(schema.revenue.amount) })
		.from(schema.revenue)
		.where(
			and(
				eq(schema.revenue.associatedSalespersonId, actualSalespersonId),
				gte(schema.revenue.closedAt, monthStart),
				lt(schema.revenue.closedAt, monthEnd),
			),
		);

	// Calculate QTD revenue
	const qtdRevenue = await db
		.select({ total: sum(schema.revenue.amount) })
		.from(schema.revenue)
		.where(
			and(
				eq(schema.revenue.associatedSalespersonId, actualSalespersonId),
				gte(schema.revenue.closedAt, quarterStart),
				lt(schema.revenue.closedAt, quarterEnd),
			),
		);

	// Calculate performance metrics
	const revenueMetrics = {
		mtdClosed: Number(mtdRevenue[0]?.total ?? 0),
		qtdClosed: Number(qtdRevenue[0]?.total ?? 0),
		monthlyQuota: Number(company?.revenueGoal ?? 0),
		quarterlyQuota: Number(company?.revenueGoal ?? 0) * 3, // Assuming quarterly quota is 3x monthly
	};

	// Calculate average rating from interaction ratings (Vantage Score)
	const avgScore = allRatings.length > 0 ? Math.round(allRatings.reduce((acc, r) => acc + r.value, 0) / allRatings.length) : 0;

	return {
		salesperson,
		company,
		avgScore,
		interactions,
		flags,
		revenue,
		revenueMetrics,
	};
}

const app = new Hono<AuthVariable<false>>()
	.get("/allCalls", requireAuth, async (c) => {
		const currentUser = c.get("user");

		// Check if user is site admin
		const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, currentUser.id));
		const isSiteAdmin = userRoles.some((role) => role.role === "admin");

		// Get all companies the user has access to
		const userCompanies = await db.select().from(schema.companyUserRoles).where(eq(schema.companyUserRoles.userId, currentUser.id));

		let companyIds: number[] = [];
		let salespersonIds: number[] = [];

		if (isSiteAdmin) {
			// Site admin can see all interactions
			const allSalespeople = await db.select().from(schema.salespeople);
			salespersonIds = allSalespeople.map((sp) => sp.id);
		} else {
			if (userCompanies.length === 0) {
				return c.json({ interactions: [] });
			}

			companyIds = userCompanies.map((uc) => uc.companyId);

			// Get all salespeople in those companies
			const salespeople = await db.select().from(schema.salespeople).where(inArray(schema.salespeople.companyId, companyIds));

			salespersonIds = salespeople.map((sp) => sp.id);

			if (salespersonIds.length === 0) {
				return c.json({ interactions: [] });
			}
		}

		// Get all salespeople for the map (either filtered or all for admin)
		const allSalespeopleForMap = isSiteAdmin
			? await db.select().from(schema.salespeople)
			: await db.select().from(schema.salespeople).where(inArray(schema.salespeople.companyId, companyIds));

		// Create a map of salesperson ID to salesperson data for quick lookup
		const salespersonMap = new Map(allSalespeopleForMap.map((sp) => [sp.id, sp]));

		// Get all interactions for those salespeople
		const interactionsRaw = await db.select().from(schema.interactions).where(inArray(schema.interactions.salespersonId, salespersonIds));

		// Fetch related data for all interactions
		const interactionIds = interactionsRaw.map((i) => i.id);
		const [allFiles, allRatings, allSkills, allFlags, allInteractionObjections, allInteractionPainPoints, allObjections, allPainPoints] =
			await Promise.all([
				interactionIds.length > 0
					? db.select().from(schema.bigfiles).where(inArray(schema.bigfiles.interactionId, interactionIds))
					: Promise.resolve([]),
				interactionIds.length > 0
					? db.select().from(schema.ratings).where(inArray(schema.ratings.interactionId, interactionIds))
					: Promise.resolve([]),
				interactionIds.length > 0
					? db.select().from(schema.skillsAssessments).where(inArray(schema.skillsAssessments.interactionId, interactionIds))
					: Promise.resolve([]),
				interactionIds.length > 0
					? db.select().from(schema.flags).where(inArray(schema.flags.interactionId, interactionIds))
					: Promise.resolve([]),
				interactionIds.length > 0
					? db.select().from(schema.interactionObjections).where(inArray(schema.interactionObjections.interactionId, interactionIds))
					: Promise.resolve([]),
				interactionIds.length > 0
					? db.select().from(schema.interactionPainPoints).where(inArray(schema.interactionPainPoints.interactionId, interactionIds))
					: Promise.resolve([]),
				db.select().from(schema.objections).where(inArray(schema.objections.companyId, companyIds)),
				db.select().from(schema.painPoints).where(inArray(schema.painPoints.companyId, companyIds)),
			]);

		// Create lookup maps for objections and pain points
		const objectionMap = new Map(allObjections.map((o) => [o.id, o]));
		const painPointMap = new Map(allPainPoints.map((p) => [p.id, p]));

		// Group related data by interaction ID
		type BigFile = (typeof allFiles)[number];
		type Rating = (typeof allRatings)[number];
		type SkillAssessment = (typeof allSkills)[number];
		type Flag = (typeof allFlags)[number];
		type InteractionObjection = (typeof allInteractionObjections)[number];
		type InteractionPainPoint = (typeof allInteractionPainPoints)[number];

		const filesByInteraction = new Map<number, BigFile[]>();
		const ratingsByInteraction = new Map<number, Rating[]>();
		const skillsByInteraction = new Map<number, SkillAssessment[]>();
		const flagsByInteraction = new Map<number, Flag[]>();
		const objectionsByInteraction = new Map<number, InteractionObjection[]>();
		const painPointsByInteraction = new Map<number, InteractionPainPoint[]>();

		for (const file of allFiles) {
			if (file.interactionId) {
				if (!filesByInteraction.has(file.interactionId)) {
					filesByInteraction.set(file.interactionId, []);
				}
				filesByInteraction.get(file.interactionId)!.push(file);
			}
		}

		for (const rating of allRatings) {
			if (!ratingsByInteraction.has(rating.interactionId)) {
				ratingsByInteraction.set(rating.interactionId, []);
			}
			ratingsByInteraction.get(rating.interactionId)!.push(rating);
		}

		for (const skill of allSkills) {
			if (skill.interactionId) {
				if (!skillsByInteraction.has(skill.interactionId)) {
					skillsByInteraction.set(skill.interactionId, []);
				}
				skillsByInteraction.get(skill.interactionId)!.push(skill);
			}
		}

		for (const flag of allFlags) {
			if (flag.interactionId) {
				if (!flagsByInteraction.has(flag.interactionId)) {
					flagsByInteraction.set(flag.interactionId, []);
				}
				flagsByInteraction.get(flag.interactionId)!.push(flag);
			}
		}

		for (const io of allInteractionObjections) {
			if (!objectionsByInteraction.has(io.interactionId)) {
				objectionsByInteraction.set(io.interactionId, []);
			}
			objectionsByInteraction.get(io.interactionId)!.push(io);
		}

		for (const ip of allInteractionPainPoints) {
			if (!painPointsByInteraction.has(ip.interactionId)) {
				painPointsByInteraction.set(ip.interactionId, []);
			}
			painPointsByInteraction.get(ip.interactionId)!.push(ip);
		}

		// Add related data to each interaction, including salesperson info
		const interactions = interactionsRaw.map((interaction) => {
			// Get objections with their titles
			const interactionObjections = objectionsByInteraction.get(interaction.id) ?? [];
			const objectionsWithTitles = interactionObjections.map((io) => ({
				...io,
				objectionTitle: objectionMap.get(io.objectionId)?.title ?? "Unknown",
			}));

			// Get pain points with their titles
			const interactionPainPoints = painPointsByInteraction.get(interaction.id) ?? [];
			const painPointsWithTitles = interactionPainPoints.map((ip) => ({
				...ip,
				painPointTitle: painPointMap.get(ip.painPointId)?.title ?? "Unknown",
				isProspectPain: painPointMap.get(ip.painPointId)?.isProspectPain ?? true,
			}));

			return {
				...interaction,
				rawInteractionText: computeRawInteractionText(interaction),
				files: filesByInteraction.get(interaction.id) ?? [],
				ratings: ratingsByInteraction.get(interaction.id) ?? [],
				skillsAssessments: skillsByInteraction.get(interaction.id) ?? [],
				flags: flagsByInteraction.get(interaction.id) ?? [],
				salesperson: salespersonMap.get(interaction.salespersonId) ?? null,
				objections: objectionsWithTitles,
				painPoints: painPointsWithTitles,
			};
		});

		return c.json({ interactions });
	})
	.get("/flag/:flagId", requireAuth, zValidator("param", flagIdParamSchema), async (c) => {
		const flagId = c.req.valid("param").flagId;
		const currentUser = c.get("user");

		const result = await flagDetailsData(flagId);

		if (!result) {
			return c.json({ error: "Flag not found" }, 404);
		}

		// Check authorization using helper function
		const hasAccess = await checkSalespersonAccess(currentUser.id, result.salesperson.salesperson);
		if (!hasAccess) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		return c.json(result);
	})
	.get("/me", requireAuth, async (c) => {
		const currentUser = c.get("user");

		// Use admin fallback for users without direct salesperson association
		const salespersonResult = await getSalespersonForUserWithAdminFallback(currentUser.id);

		if (!salespersonResult) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		const result = await salesPersonData({ salespersonId: salespersonResult.salesperson.id });

		if (!result) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		return c.json(result);
	})
	.get("/:id", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const salespersonId = c.req.valid("param").id;
		const currentUser = c.get("user");

		const result = await salesPersonData({ salespersonId });

		if (!result) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check authorization using helper function
		const hasAccess = await checkSalespersonAccess(currentUser.id, result.salesperson);
		if (!hasAccess) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		return c.json(result);
	})
	// Get skill trends over time for a salesperson
	.get("/:id/skills/trends", requireAuth, zValidator("param", idParamSchema), zValidator("query", skillTrendsQuerySchema), async (c) => {
		const salespersonId = c.req.valid("param").id;
		const { period, limit } = c.req.valid("query");
		const currentUser = c.get("user");

		// Check if salesperson exists and user has access
		const salesperson = await salesPersonData({ salespersonId });
		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson.salesperson);
		if (!hasAccess) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const trends = await getSalespersonSkillTrends({
			salespersonId,
			period: period as TimePeriod,
			limit,
		});

		return c.json(trends);
	})
	// Get current period summary (week and month) for a salesperson
	.get("/:id/skills/summary", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const salespersonId = c.req.valid("param").id;
		const currentUser = c.get("user");

		// Check if salesperson exists and user has access
		const salesperson = await salesPersonData({ salespersonId });
		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson.salesperson);
		if (!hasAccess) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const summary = await getCurrentPeriodSummary(salespersonId);

		return c.json(summary);
	})
	// Get skill distribution (how many calls at each score level)
	.get(
		"/:id/skills/distribution",
		requireAuth,
		zValidator("param", idParamSchema),
		zValidator("query", skillDistributionQuerySchema),
		async (c) => {
			const salespersonId = c.req.valid("param").id;
			const { skill } = c.req.valid("query");
			const currentUser = c.get("user");

			// Check if salesperson exists and user has access
			const salesperson = await salesPersonData({ salespersonId });
			if (!salesperson) {
				return c.json({ error: "Salesperson not found" }, 404);
			}

			const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson.salesperson);
			if (!hasAccess) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			const distribution = await getSkillDistribution(salespersonId, skill);

			// Calculate percentages
			const total = distribution.reduce((sum, d) => sum + d.count, 0);
			const distributionWithPercentages = distribution.map((d) => ({
				...d,
				percentage: total > 0 ? Number(((d.count / total) * 100).toFixed(1)) : 0,
			}));

			return c.json(distributionWithPercentages);
		},
	)
	// Get detailed call-by-call data for a specific skill
	.get(
		"/:id/skills/details",
		requireAuth,
		zValidator("param", idParamSchema),
		zValidator("query", skillDistributionQuerySchema),
		async (c) => {
			const salespersonId = c.req.valid("param").id;
			const { skill } = c.req.valid("query");
			const currentUser = c.get("user");

			// Check if salesperson exists and user has access
			const salesperson = await salesPersonData({ salespersonId });
			if (!salesperson) {
				return c.json({ error: "Salesperson not found" }, 404);
			}

			const hasAccess = await checkSalespersonAccess(currentUser.id, salesperson.salesperson);
			if (!hasAccess) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			const callDetails = await getSkillCallDetails(salespersonId, skill);

			return c.json(callDetails);
		},
	);

export default app;
