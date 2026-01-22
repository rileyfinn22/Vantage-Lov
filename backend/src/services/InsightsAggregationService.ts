/**
 * InsightsAggregationService - Phase 2 of extraction pipeline
 *
 * Aggregates extracted objections and pain points over a time window (weekly)
 * and calculates impact scores to surface the top 3 most important items.
 *
 * Impact Score Formula:
 * Impact Score = (Frequency × Failure Rate) × Confidence Weight
 *
 * Where:
 * - Frequency = Number of times objection/pain point appeared in the period
 * - Failure Rate = (1 - Success Rate)
 *   - For objections: 1 - (overcome_count / total_count)
 *   - For pain points: 1 - (resolved_count / total_count)
 * - Confidence Weight = MIN(1, Frequency / Minimum_Threshold)
 *   - Minimum_Threshold = 3 (need at least 3 occurrences for full confidence)
 */

import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { logger } from "#/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface AggregatedObjection {
	id: number;
	title: string;
	description: string;
	frequency: number;
	successRate: number; // Percentage overcome
	impactScore: number;
	trend: "up" | "down" | "stable";
	phase: string;
	topExamples: ObjectionExample[];
}

export interface ObjectionExample {
	interactionId: number;
	verbatimQuote: string;
	repResponse: string;
	effectiveness: string;
	clipWorthyRating: number;
	clipReason: string | null;
	timestampStart: string;
	timestampEnd: string;
}

export interface AggregatedPainPoint {
	id: number;
	title: string;
	description: string;
	frequency: number;
	resolutionRate: number; // Percentage capitalized on (for prospect) or addressed (for rep)
	impactScore: number;
	isProspectPain: boolean;
	phase: string;
	topExamples: PainPointExample[];
}

export interface PainPointExample {
	interactionId: number;
	verbatimQuote: string;
	capitalizedOn?: boolean;
	capitalizationQuote?: string;
	rootCause?: string;
	clipWorthyRating: number;
	clipReason: string | null;
	timestampStart: string;
	timestampEnd: string;
}

export interface WeeklyInsights {
	weekStart: Date;
	weekEnd: Date;
	companyId: number;
	totalCallsAnalyzed: number;
	topObjections: AggregatedObjection[];
	topProspectPainPoints: AggregatedPainPoint[];
	topRepPainPoints: AggregatedPainPoint[];
	generatedAt: Date;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MINIMUM_THRESHOLD = 3; // Minimum occurrences for full confidence weight
const TOP_N = 3; // Number of top items to return

// ============================================================================
// IMPACT SCORE CALCULATION
// ============================================================================

/**
 * Calculate impact score for an objection or pain point
 *
 * Impact Score = (Frequency × Failure Rate) × Confidence Weight
 *
 * @param frequency - Number of times item appeared
 * @param successRate - Rate at which it was successfully handled (0-1)
 * @returns Impact score (higher = more important to address)
 */
export function calculateImpactScore(frequency: number, successRate: number): number {
	const failureRate = 1 - successRate;
	const confidenceWeight = Math.min(1, frequency / MINIMUM_THRESHOLD);
	const impactScore = frequency * failureRate * confidenceWeight;

	return Math.round(impactScore * 100) / 100; // Round to 2 decimal places
}

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Get the start and end of a week containing the given date
 * Week starts on Monday
 */
export function getWeekBounds(date: Date = new Date()): { weekStart: Date; weekEnd: Date } {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

	const weekStart = new Date(d.setDate(diff));
	weekStart.setHours(0, 0, 0, 0);

	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999);

	return { weekStart, weekEnd };
}

// ============================================================================
// AGGREGATION QUERIES
// ============================================================================

/**
 * Get aggregated objection data for a company within a date range
 */
async function getObjectionAggregates(companyId: number, startDate: Date, endDate: Date): Promise<AggregatedObjection[]> {
	// Get objection stats aggregated by objectionId
	const stats = await db
		.select({
			objectionId: schema.interactionObjections.objectionId,
			title: schema.objections.title,
			description: schema.objections.description,
			phase: schema.objections.phase,
			trend: schema.objections.trend,
			frequency: sql<number>`COUNT(*)`.as("frequency"),
			overcomeCount: sql<number>`SUM(CASE WHEN ${schema.interactionObjections.wasOvercome} = true THEN 1 ELSE 0 END)`.as("overcome_count"),
		})
		.from(schema.interactionObjections)
		.innerJoin(schema.objections, eq(schema.interactionObjections.objectionId, schema.objections.id))
		.innerJoin(schema.interactions, eq(schema.interactionObjections.interactionId, schema.interactions.id))
		.where(
			and(
				eq(schema.objections.companyId, companyId),
				gte(schema.interactionObjections.createdAt, startDate),
				lte(schema.interactionObjections.createdAt, endDate),
			),
		)
		.groupBy(
			schema.interactionObjections.objectionId,
			schema.objections.title,
			schema.objections.description,
			schema.objections.phase,
			schema.objections.trend,
		);

	// Calculate impact scores and get examples
	const aggregated: AggregatedObjection[] = [];

	for (const stat of stats) {
		const successRate = stat.frequency > 0 ? stat.overcomeCount / stat.frequency : 0;
		const impactScore = calculateImpactScore(stat.frequency, successRate);

		// Get top examples (highest clip-worthy ratings)
		const examples = await db
			.select({
				interactionId: schema.interactionObjections.interactionId,
				verbatimQuote: schema.interactionObjections.verbatimQuote,
				repResponse: schema.interactionObjections.repResponse,
				effectiveness: schema.interactionObjections.repResponseEffectiveness,
				clipWorthyRating: schema.interactionObjections.clipWorthyRating,
				clipReason: schema.interactionObjections.clipReason,
				timestampStart: schema.interactionObjections.timestampStart,
				timestampEnd: schema.interactionObjections.timestampEnd,
			})
			.from(schema.interactionObjections)
			.where(
				and(
					eq(schema.interactionObjections.objectionId, stat.objectionId),
					gte(schema.interactionObjections.createdAt, startDate),
					lte(schema.interactionObjections.createdAt, endDate),
				),
			)
			.orderBy(desc(schema.interactionObjections.clipWorthyRating))
			.limit(3);

		aggregated.push({
			id: stat.objectionId,
			title: stat.title,
			description: stat.description,
			frequency: stat.frequency,
			successRate: Math.round(successRate * 100),
			impactScore,
			trend: stat.trend as "up" | "down" | "stable",
			phase: stat.phase,
			topExamples: examples.map((e) => ({
				interactionId: e.interactionId,
				verbatimQuote: e.verbatimQuote ?? "",
				repResponse: e.repResponse ?? "",
				effectiveness: e.effectiveness ?? "",
				clipWorthyRating: e.clipWorthyRating ?? 0,
				clipReason: e.clipReason,
				timestampStart: e.timestampStart ?? "",
				timestampEnd: e.timestampEnd ?? "",
			})),
		});
	}

	// Sort by impact score descending and return top N
	return aggregated.sort((a, b) => b.impactScore - a.impactScore).slice(0, TOP_N);
}

/**
 * Get aggregated pain point data for a company within a date range
 */
async function getPainPointAggregates(
	companyId: number,
	startDate: Date,
	endDate: Date,
	isProspectPain: boolean,
): Promise<AggregatedPainPoint[]> {
	// Get pain point stats aggregated by painPointId
	const stats = await db
		.select({
			painPointId: schema.interactionPainPoints.painPointId,
			title: schema.painPoints.title,
			description: schema.painPoints.description,
			phase: schema.painPoints.phase,
			isProspectPain: schema.painPoints.isProspectPain,
			frequency: sql<number>`COUNT(*)`.as("frequency"),
			resolvedCount: sql<number>`SUM(CASE WHEN ${schema.interactionPainPoints.wasResolved} = true THEN 1 ELSE 0 END)`.as("resolved_count"),
		})
		.from(schema.interactionPainPoints)
		.innerJoin(schema.painPoints, eq(schema.interactionPainPoints.painPointId, schema.painPoints.id))
		.innerJoin(schema.interactions, eq(schema.interactionPainPoints.interactionId, schema.interactions.id))
		.where(
			and(
				eq(schema.painPoints.companyId, companyId),
				eq(schema.painPoints.isProspectPain, isProspectPain),
				gte(schema.interactionPainPoints.createdAt, startDate),
				lte(schema.interactionPainPoints.createdAt, endDate),
			),
		)
		.groupBy(
			schema.interactionPainPoints.painPointId,
			schema.painPoints.title,
			schema.painPoints.description,
			schema.painPoints.phase,
			schema.painPoints.isProspectPain,
		);

	// Calculate impact scores and get examples
	const aggregated: AggregatedPainPoint[] = [];

	for (const stat of stats) {
		const resolutionRate = stat.frequency > 0 ? stat.resolvedCount / stat.frequency : 0;
		const impactScore = calculateImpactScore(stat.frequency, resolutionRate);

		// Get top examples (highest clip-worthy ratings)
		const examples = await db
			.select({
				interactionId: schema.interactionPainPoints.interactionId,
				verbatimQuote: schema.interactionPainPoints.verbatimQuote,
				capitalizedOn: schema.interactionPainPoints.capitalizedOn,
				capitalizationQuote: schema.interactionPainPoints.capitalizationQuote,
				rootCause: schema.interactionPainPoints.rootCause,
				clipWorthyRating: schema.interactionPainPoints.clipWorthyRating,
				clipReason: schema.interactionPainPoints.clipReason,
				timestampStart: schema.interactionPainPoints.timestampStart,
				timestampEnd: schema.interactionPainPoints.timestampEnd,
			})
			.from(schema.interactionPainPoints)
			.where(
				and(
					eq(schema.interactionPainPoints.painPointId, stat.painPointId),
					gte(schema.interactionPainPoints.createdAt, startDate),
					lte(schema.interactionPainPoints.createdAt, endDate),
				),
			)
			.orderBy(desc(schema.interactionPainPoints.clipWorthyRating))
			.limit(3);

		aggregated.push({
			id: stat.painPointId,
			title: stat.title,
			description: stat.description,
			frequency: stat.frequency,
			resolutionRate: Math.round(resolutionRate * 100),
			impactScore,
			isProspectPain: stat.isProspectPain,
			phase: stat.phase,
			topExamples: examples.map((e) => ({
				interactionId: e.interactionId,
				verbatimQuote: e.verbatimQuote ?? "",
				capitalizedOn: e.capitalizedOn ?? undefined,
				capitalizationQuote: e.capitalizationQuote ?? undefined,
				rootCause: e.rootCause ?? undefined,
				clipWorthyRating: e.clipWorthyRating ?? 0,
				clipReason: e.clipReason,
				timestampStart: e.timestampStart ?? "",
				timestampEnd: e.timestampEnd ?? "",
			})),
		});
	}

	// Sort by impact score descending and return top N
	return aggregated.sort((a, b) => b.impactScore - a.impactScore).slice(0, TOP_N);
}

/**
 * Get total calls analyzed in the period
 */
async function getTotalCallsAnalyzed(companyId: number, startDate: Date, endDate: Date): Promise<number> {
	const result = await db
		.select({
			count: sql<number>`COUNT(DISTINCT ${schema.interactions.id})`.as("count"),
		})
		.from(schema.interactions)
		.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
		.where(
			and(
				eq(schema.salespeople.companyId, companyId),
				gte(schema.interactions.createdAt, startDate),
				lte(schema.interactions.createdAt, endDate),
				eq(schema.interactions.processedStatus, "processed"),
			),
		);

	return result[0]?.count ?? 0;
}

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Generate weekly insights for a company
 *
 * @param companyId - The company to generate insights for
 * @param weekDate - Any date within the desired week (defaults to current week)
 * @returns WeeklyInsights with top 3 objections and pain points
 */
export async function generateWeeklyInsights(companyId: number, weekDate: Date = new Date()): Promise<WeeklyInsights> {
	const { weekStart, weekEnd } = getWeekBounds(weekDate);

	logger.info(
		{
			companyId,
			weekStart: weekStart.toISOString(),
			weekEnd: weekEnd.toISOString(),
		},
		"Generating weekly insights",
	);

	// Run aggregations in parallel
	const [totalCallsAnalyzed, topObjections, topProspectPainPoints, topRepPainPoints] = await Promise.all([
		getTotalCallsAnalyzed(companyId, weekStart, weekEnd),
		getObjectionAggregates(companyId, weekStart, weekEnd),
		getPainPointAggregates(companyId, weekStart, weekEnd, true),
		getPainPointAggregates(companyId, weekStart, weekEnd, false),
	]);

	const insights: WeeklyInsights = {
		weekStart,
		weekEnd,
		companyId,
		totalCallsAnalyzed,
		topObjections,
		topProspectPainPoints,
		topRepPainPoints,
		generatedAt: new Date(),
	};

	logger.info(
		{
			companyId,
			totalCalls: totalCallsAnalyzed,
			objectionCount: topObjections.length,
			prospectPainCount: topProspectPainPoints.length,
			repPainCount: topRepPainPoints.length,
		},
		"Generated weekly insights",
	);

	return insights;
}

/**
 * Generate insights for a custom date range
 */
export async function generateInsightsForRange(
	companyId: number,
	startDate: Date,
	endDate: Date,
): Promise<Omit<WeeklyInsights, "weekStart" | "weekEnd"> & { startDate: Date; endDate: Date }> {
	logger.info(
		{
			companyId,
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString(),
		},
		"Generating insights for custom range",
	);

	const [totalCallsAnalyzed, topObjections, topProspectPainPoints, topRepPainPoints] = await Promise.all([
		getTotalCallsAnalyzed(companyId, startDate, endDate),
		getObjectionAggregates(companyId, startDate, endDate),
		getPainPointAggregates(companyId, startDate, endDate, true),
		getPainPointAggregates(companyId, startDate, endDate, false),
	]);

	return {
		startDate,
		endDate,
		companyId,
		totalCallsAnalyzed,
		topObjections,
		topProspectPainPoints,
		topRepPainPoints,
		generatedAt: new Date(),
	};
}

/**
 * Generate weekly insights WITH battle cards and training scenarios
 * This is Phase 2 complete: aggregation + battle card generation
 *
 * @param companyId - The company to generate insights for
 * @param weekDate - Any date within the desired week (defaults to current week)
 * @param generateBattleCards - Whether to generate battle cards (default: true)
 * @returns WeeklyInsights with battle card IDs if generated
 */
export async function generateWeeklyInsightsWithBattleCards(
	companyId: number,
	weekDate: Date = new Date(),
	generateBattleCards = true,
): Promise<WeeklyInsights & { battleCardIds?: number[]; scenarioIds?: number[] }> {
	// First get the regular insights
	const insights = await generateWeeklyInsights(companyId, weekDate);

	if (!generateBattleCards) {
		return insights;
	}

	// Lazy import to avoid circular dependencies
	const { generateBattleCardsForObjections, generateBattleCardsForPainPoints } = await import("./BattleCardGenerationService");

	logger.info({ companyId }, "Generating battle cards for weekly insights");

	// Generate battle cards for top objections and pain points
	const allPainPoints = [...insights.topProspectPainPoints, ...insights.topRepPainPoints];

	const [objectionResults, painPointResults] = await Promise.all([
		generateBattleCardsForObjections(companyId, insights.topObjections),
		generateBattleCardsForPainPoints(companyId, allPainPoints),
	]);

	const battleCardIds = [...objectionResults.map((r) => r.battleCardId), ...painPointResults.map((r) => r.battleCardId)];
	const scenarioIds = [...objectionResults.map((r) => r.scenarioId), ...painPointResults.map((r) => r.scenarioId)];

	logger.info(
		{
			companyId,
			battleCardsGenerated: battleCardIds.length,
			scenariosGenerated: scenarioIds.length,
		},
		"Generated battle cards and scenarios for weekly insights",
	);

	return {
		...insights,
		battleCardIds,
		scenarioIds,
	};
}
