import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";

/**
 * Time period types for aggregations
 */
export type TimePeriod = "week" | "month" | "quarter" | "all";

/**
 * Get skill trends for a salesperson over a time period
 */
export async function getSalespersonSkillTrends(params: { salespersonId: number; period?: TimePeriod; limit?: number }) {
	const { salespersonId, period = "month", limit = 12 } = params;

	// Calculate date threshold based on period
	const now = new Date();
	const threshold = new Date();

	switch (period) {
		case "week":
			threshold.setDate(now.getDate() - limit * 7);
			break;
		case "month":
			threshold.setMonth(now.getMonth() - limit);
			break;
		case "quarter":
			threshold.setMonth(now.getMonth() - limit * 3);
			break;
		case "all":
			threshold.setFullYear(2000); // Get all historical data
			break;
	}

	// Determine the SQL truncation based on period
	let dateTrunc: ReturnType<typeof sql>;
	switch (period) {
		case "week":
			dateTrunc = sql`date_trunc('week', ${schema.skillsAssessments.createdAt})`;
			break;
		case "month":
			dateTrunc = sql`date_trunc('month', ${schema.skillsAssessments.createdAt})`;
			break;
		case "quarter":
			dateTrunc = sql`date_trunc('quarter', ${schema.skillsAssessments.createdAt})`;
			break;
		case "all":
			dateTrunc = sql`date_trunc('year', ${schema.skillsAssessments.createdAt})`;
			break;
	}

	// Query aggregated skill scores by time period
	const trends = await db
		.select({
			period: dateTrunc.as("period"),
			avgOverallRating: sql<number>`AVG(${schema.ratings.value})`.as("avg_overall_rating"),
			avgObjectionHandling:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.objectionHandlingScore} > 0 THEN ${schema.skillsAssessments.objectionHandlingScore} ELSE NULL END)`.as(
					"avg_objection_handling",
				),
			avgPricingDiscussions:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.pricingDiscussionsScore} > 0 THEN ${schema.skillsAssessments.pricingDiscussionsScore} ELSE NULL END)`.as(
					"avg_pricing_discussions",
				),
			avgDiscovery:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.discoveryFeaturesScore} > 0 THEN ${schema.skillsAssessments.discoveryFeaturesScore} ELSE NULL END)`.as(
					"avg_discovery",
				),
			avgClosing:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.closingScore} > 0 THEN ${schema.skillsAssessments.closingScore} ELSE NULL END)`.as(
					"avg_closing",
				),
			callCount: sql<number>`COUNT(*)`.as("call_count"),
		})
		.from(schema.skillsAssessments)
		.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
		.innerJoin(schema.ratings, eq(schema.skillsAssessments.interactionId, schema.ratings.interactionId))
		.where(and(eq(schema.interactions.salespersonId, salespersonId), gte(schema.skillsAssessments.createdAt, threshold)))
		.groupBy(dateTrunc)
		.orderBy(desc(dateTrunc))
		.limit(limit);

	// Calculate trends (% change from previous period)
	const trendsWithChange = trends.map((current, index) => {
		const previous = trends[index + 1];

		const calculateChange = (currentVal: number | null, prevVal: number | null): number | null => {
			if (currentVal === null || prevVal === null || prevVal === 0) return null;
			return Number((((currentVal - prevVal) / prevVal) * 100).toFixed(1));
		};

		return {
			period: current.period,
			metrics: {
				overallRating: {
					average: current.avgOverallRating ? Number(Number(current.avgOverallRating).toFixed(1)) : null,
					change: previous ? calculateChange(Number(current.avgOverallRating), Number(previous.avgOverallRating)) : null,
				},
				objectionHandling: {
					average: current.avgObjectionHandling ? Number(Number(current.avgObjectionHandling).toFixed(1)) : null,
					change: previous ? calculateChange(Number(current.avgObjectionHandling), Number(previous.avgObjectionHandling)) : null,
				},
				pricingDiscussions: {
					average: current.avgPricingDiscussions ? Number(Number(current.avgPricingDiscussions).toFixed(1)) : null,
					change: previous ? calculateChange(Number(current.avgPricingDiscussions), Number(previous.avgPricingDiscussions)) : null,
				},
				discovery: {
					average: current.avgDiscovery ? Number(Number(current.avgDiscovery).toFixed(1)) : null,
					change: previous ? calculateChange(Number(current.avgDiscovery), Number(previous.avgDiscovery)) : null,
				},
				closing: {
					average: current.avgClosing ? Number(Number(current.avgClosing).toFixed(1)) : null,
					change: previous ? calculateChange(Number(current.avgClosing), Number(previous.avgClosing)) : null,
				},
			},
			callCount: current.callCount,
		};
	});

	return trendsWithChange;
}

/**
 * Get current period summary for a salesperson
 */
export async function getCurrentPeriodSummary(salespersonId: number) {
	const now = new Date();
	const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const currentWeekStart = new Date(now);
	currentWeekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)

	// Get current month stats
	const monthStats = await db
		.select({
			avgOverallRating: sql<number>`AVG(${schema.ratings.value})`.as("avg_overall_rating"),
			avgObjectionHandling:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.objectionHandlingScore} > 0 THEN ${schema.skillsAssessments.objectionHandlingScore} ELSE NULL END)`.as(
					"avg_objection_handling",
				),
			avgPricingDiscussions:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.pricingDiscussionsScore} > 0 THEN ${schema.skillsAssessments.pricingDiscussionsScore} ELSE NULL END)`.as(
					"avg_pricing_discussions",
				),
			avgDiscovery:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.discoveryFeaturesScore} > 0 THEN ${schema.skillsAssessments.discoveryFeaturesScore} ELSE NULL END)`.as(
					"avg_discovery",
				),
			avgClosing:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.closingScore} > 0 THEN ${schema.skillsAssessments.closingScore} ELSE NULL END)`.as(
					"avg_closing",
				),
			callCount: sql<number>`COUNT(*)`.as("call_count"),
		})
		.from(schema.skillsAssessments)
		.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
		.innerJoin(schema.ratings, eq(schema.skillsAssessments.interactionId, schema.ratings.interactionId))
		.where(and(eq(schema.interactions.salespersonId, salespersonId), gte(schema.skillsAssessments.createdAt, currentMonthStart)));

	// Get current week stats
	const weekStats = await db
		.select({
			avgOverallRating: sql<number>`AVG(${schema.ratings.value})`.as("avg_overall_rating"),
			avgObjectionHandling:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.objectionHandlingScore} > 0 THEN ${schema.skillsAssessments.objectionHandlingScore} ELSE NULL END)`.as(
					"avg_objection_handling",
				),
			avgPricingDiscussions:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.pricingDiscussionsScore} > 0 THEN ${schema.skillsAssessments.pricingDiscussionsScore} ELSE NULL END)`.as(
					"avg_pricing_discussions",
				),
			avgDiscovery:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.discoveryFeaturesScore} > 0 THEN ${schema.skillsAssessments.discoveryFeaturesScore} ELSE NULL END)`.as(
					"avg_discovery",
				),
			avgClosing:
				sql<number>`AVG(CASE WHEN ${schema.skillsAssessments.closingScore} > 0 THEN ${schema.skillsAssessments.closingScore} ELSE NULL END)`.as(
					"avg_closing",
				),
			callCount: sql<number>`COUNT(*)`.as("call_count"),
		})
		.from(schema.skillsAssessments)
		.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
		.innerJoin(schema.ratings, eq(schema.skillsAssessments.interactionId, schema.ratings.interactionId))
		.where(and(eq(schema.interactions.salespersonId, salespersonId), gte(schema.skillsAssessments.createdAt, currentWeekStart)));

	const formatStats = (stats: typeof monthStats) => {
		const stat = stats[0];
		if (!stat) return null;

		return {
			overallRating: stat.avgOverallRating ? Number(Number(stat.avgOverallRating).toFixed(1)) : null,
			objectionHandling: stat.avgObjectionHandling ? Number(Number(stat.avgObjectionHandling).toFixed(1)) : null,
			pricingDiscussions: stat.avgPricingDiscussions ? Number(Number(stat.avgPricingDiscussions).toFixed(1)) : null,
			discovery: stat.avgDiscovery ? Number(Number(stat.avgDiscovery).toFixed(1)) : null,
			closing: stat.avgClosing ? Number(Number(stat.avgClosing).toFixed(1)) : null,
			callCount: stat.callCount,
		};
	};

	return {
		currentWeek: formatStats(weekStats),
		currentMonth: formatStats(monthStats),
	};
}

/**
 * Get skill distribution (how many calls at each skill level)
 */
export async function getSkillDistribution(
	salespersonId: number,
	skillName: "objection_handling" | "pricing_discussions" | "discovery" | "closing",
) {
	// Map skill name to database column
	const scoreColumn =
		skillName === "objection_handling"
			? schema.skillsAssessments.objectionHandlingScore
			: skillName === "pricing_discussions"
				? schema.skillsAssessments.pricingDiscussionsScore
				: skillName === "discovery"
					? schema.skillsAssessments.discoveryFeaturesScore
					: schema.skillsAssessments.closingScore;

	const distribution = await db
		.select({
			score: scoreColumn,
			count: sql<number>`COUNT(*)`.as("count"),
		})
		.from(schema.skillsAssessments)
		.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
		.where(and(eq(schema.interactions.salespersonId, salespersonId), sql`${scoreColumn} > 0`)) // Exclude N/A (stored as 0)
		.groupBy(scoreColumn)
		.orderBy(scoreColumn);

	return distribution.map((d) => ({
		score: d.score,
		count: d.count,
		percentage: 0, // Will be calculated after getting total
	}));
}

/**
 * Get detailed call-by-call data for a specific skill
 * Returns all calls with their skill scores and assessment details
 */
export async function getSkillCallDetails(
	salespersonId: number,
	skillName: "objection_handling" | "pricing_discussions" | "discovery" | "closing",
) {
	// Map skill name to database column and assessment data key
	const scoreColumn =
		skillName === "objection_handling"
			? schema.skillsAssessments.objectionHandlingScore
			: skillName === "pricing_discussions"
				? schema.skillsAssessments.pricingDiscussionsScore
				: skillName === "discovery"
					? schema.skillsAssessments.discoveryFeaturesScore
					: schema.skillsAssessments.closingScore;

	const assessmentKey = skillName === "discovery" ? "discovery_needs_analysis" : skillName === "closing" ? "closing_next_steps" : skillName;

	const callDetails = await db
		.select({
			interactionId: schema.interactions.id,
			interactionBlurb: schema.interactions.blurb,
			interactionDate: schema.interactions.createdAt,
			skillScore: scoreColumn,
			assessmentData: schema.skillsAssessments.assessmentData,
			overallRating: schema.ratings.value,
		})
		.from(schema.skillsAssessments)
		.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
		.innerJoin(schema.ratings, eq(schema.skillsAssessments.interactionId, schema.ratings.interactionId))
		.where(and(eq(schema.interactions.salespersonId, salespersonId), sql`${scoreColumn} > 0`)) // Exclude N/A
		.orderBy(desc(schema.interactions.createdAt));

	// Extract skill-specific details from assessment data
	return callDetails.map((call) => {
		const skillData = (call.assessmentData.skills as any)[assessmentKey];

		return {
			interactionId: call.interactionId,
			blurb: call.interactionBlurb,
			date: call.interactionDate,
			score: call.skillScore,
			overallRating: call.overallRating,
			evidence: skillData?.evidence ?? "N/A",
			missedOpportunity: skillData?.missed_opportunity ?? null,
		};
	});
}
