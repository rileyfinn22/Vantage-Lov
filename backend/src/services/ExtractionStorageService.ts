/**
 * ExtractionStorageService - Saves extracted objections and pain points to the database
 *
 * Handles:
 * - Finding or creating aggregated objections/pain points by title
 * - Saving per-interaction extraction data with clip information
 * - Updating frequency counts on aggregated tables
 */

import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "#/lib/logger";
import type { ExtractionResponse, ExtractedObjection, ExtractedPainPoint, ExtractedRepHighlight } from "./CallExtractionService";

// ============================================================================
// FIND OR CREATE FUNCTIONS
// ============================================================================

/**
 * Find or create an objection by title for a company
 * Returns the objection ID
 */
export async function findOrCreateObjection(
	companyId: number,
	title: string,
	phase: "outreach" | "discovery" | "demo" | "close",
): Promise<number> {
	// Try to find existing objection with this title
	const existing = await db
		.select({ id: schema.objections.id })
		.from(schema.objections)
		.where(and(eq(schema.objections.companyId, companyId), eq(schema.objections.title, title)))
		.limit(1);

	if (existing.length > 0) {
		return existing[0].id;
	}

	// Create new objection
	const [created] = await db
		.insert(schema.objections)
		.values({
			companyId,
			title,
			description: `Objection: ${title}`, // Will be enriched during aggregation
			frequency: 0, // Will be incremented after insert
			phase,
			impact: "medium", // Default, updated during aggregation based on data
			trend: "stable",
			totalCallsMentioned: 0,
		})
		.returning();

	logger.info({ companyId, title, objectionId: created.id }, "Created new objection");
	return created.id;
}

/**
 * Find or create a pain point by title for a company
 * Returns the pain point ID
 */
export async function findOrCreatePainPoint(
	companyId: number,
	title: string,
	phase: "outreach" | "discovery" | "demo" | "close",
	isProspectPain: boolean,
): Promise<number> {
	// Try to find existing pain point with this title and type
	const existing = await db
		.select({ id: schema.painPoints.id })
		.from(schema.painPoints)
		.where(
			and(
				eq(schema.painPoints.companyId, companyId),
				eq(schema.painPoints.title, title),
				eq(schema.painPoints.isProspectPain, isProspectPain),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		return existing[0].id;
	}

	// Create new pain point
	const [created] = await db
		.insert(schema.painPoints)
		.values({
			companyId,
			title,
			description: `Pain point: ${title}`, // Will be enriched during aggregation
			frequency: 0, // Will be incremented after insert
			phase,
			severity: "major", // Default, updated during aggregation
			isProspectPain,
			totalCallsMentioned: 0,
		})
		.returning();

	logger.info({ companyId, title, painPointId: created.id, isProspectPain }, "Created new pain point");
	return created.id;
}

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

/**
 * Save a single extracted objection to the database
 */
async function saveObjection(interactionId: number, companyId: number, objection: ExtractedObjection): Promise<void> {
	// Find or create the aggregated objection
	const objectionId = await findOrCreateObjection(companyId, objection.title, objection.sales_phase);

	// Insert the interaction-specific record with all extraction data
	await db.insert(schema.interactionObjections).values({
		interactionId,
		objectionId,
		wasOvercome: objection.rep_response.effectiveness === "overcame",
		verbatimQuote: objection.verbatim_quote,
		timestampStart: objection.timestamp.start,
		timestampEnd: objection.timestamp.end,
		salesPhase: objection.sales_phase,
		repResponse: objection.rep_response.quote,
		repResponseEffectiveness: objection.rep_response.effectiveness,
		repResponseTimestampStart: objection.rep_response.timestamp.start,
		repResponseTimestampEnd: objection.rep_response.timestamp.end,
		clipWorthyRating: objection.clip_worthy_rating,
		clipReason: objection.clip_reason,
	});

	// Update frequency and total calls on the aggregated objection
	await db
		.update(schema.objections)
		.set({
			frequency: sql`${schema.objections.frequency} + 1`,
			totalCallsMentioned: sql`COALESCE(${schema.objections.totalCallsMentioned}, 0) + 1`,
			updatedAt: new Date(),
		})
		.where(eq(schema.objections.id, objectionId));
}

/**
 * Save a single extracted pain point to the database
 */
async function savePainPoint(
	interactionId: number,
	companyId: number,
	painPoint: ExtractedPainPoint,
	isProspectPain: boolean,
): Promise<void> {
	// Find or create the aggregated pain point
	const painPointId = await findOrCreatePainPoint(companyId, painPoint.title, painPoint.sales_phase, isProspectPain);

	// Insert the interaction-specific record with all extraction data
	await db.insert(schema.interactionPainPoints).values({
		interactionId,
		painPointId,
		wasResolved: painPoint.capitalized_on ?? false,
		verbatimQuote: painPoint.verbatim_quote,
		timestampStart: painPoint.timestamp.start,
		timestampEnd: painPoint.timestamp.end,
		salesPhase: painPoint.sales_phase,
		painType: painPoint.type,
		capitalizedOn: painPoint.capitalized_on,
		capitalizationQuote: painPoint.capitalization_quote,
		rootCause: painPoint.root_cause,
		clipWorthyRating: painPoint.clip_worthy_rating,
		clipReason: painPoint.clip_reason,
	});

	// Update frequency and total calls on the aggregated pain point
	await db
		.update(schema.painPoints)
		.set({
			frequency: sql`${schema.painPoints.frequency} + 1`,
			totalCallsMentioned: sql`COALESCE(${schema.painPoints.totalCallsMentioned}, 0) + 1`,
			updatedAt: new Date(),
		})
		.where(eq(schema.painPoints.id, painPointId));
}

/**
 * Save a single rep highlight to the database
 * Rep highlights are stored directly (no aggregation table like objections/pain points)
 */
async function saveRepHighlight(interactionId: number, highlight: ExtractedRepHighlight): Promise<void> {
	await db.insert(schema.repHighlights).values({
		interactionId,
		skillArea: highlight.skill_area,
		technique: highlight.technique,
		verbatimQuote: highlight.verbatim_quote,
		timestampStart: highlight.timestamp.start,
		timestampEnd: highlight.timestamp.end,
		salesPhase: highlight.sales_phase,
		impact: highlight.impact,
		clipWorthyRating: highlight.clip_worthy_rating,
		clipReason: highlight.clip_reason,
	});
}

// ============================================================================
// MAIN SAVE FUNCTION
// ============================================================================

/**
 * Save all extraction results to the database
 *
 * @param interactionId - The interaction these extractions came from
 * @param companyId - The company ID for aggregation
 * @param extraction - The extraction results from CallExtractionService
 */
export async function saveExtractionResults(
	interactionId: number,
	companyId: number,
	extraction: ExtractionResponse,
): Promise<{
	objectionsSaved: number;
	prospectPainsSaved: number;
	repPainsSaved: number;
	repHighlightsSaved: number;
}> {
	const repHighlights = extraction.rep_highlights ?? [];

	logger.info(
		{
			interactionId,
			companyId,
			objections: extraction.objections.length,
			prospectPains: extraction.prospect_pain_points.length,
			repPains: extraction.rep_pain_points.length,
			repHighlights: repHighlights.length,
		},
		"Saving extraction results",
	);

	// Save objections
	for (const objection of extraction.objections) {
		try {
			await saveObjection(interactionId, companyId, objection);
		} catch (error) {
			logger.error({ interactionId, objection: objection.title, error }, "Failed to save objection");
			// Continue with other extractions
		}
	}

	// Save prospect pain points
	for (const painPoint of extraction.prospect_pain_points) {
		try {
			await savePainPoint(interactionId, companyId, painPoint, true);
		} catch (error) {
			logger.error({ interactionId, painPoint: painPoint.title, error }, "Failed to save prospect pain point");
		}
	}

	// Save rep pain points
	for (const painPoint of extraction.rep_pain_points) {
		try {
			await savePainPoint(interactionId, companyId, painPoint, false);
		} catch (error) {
			logger.error({ interactionId, painPoint: painPoint.title, error }, "Failed to save rep pain point");
		}
	}

	// Save rep highlights (positive moments)
	for (const highlight of repHighlights) {
		try {
			await saveRepHighlight(interactionId, highlight);
		} catch (error) {
			logger.error({ interactionId, technique: highlight.technique, error }, "Failed to save rep highlight");
		}
	}

	const result = {
		objectionsSaved: extraction.objections.length,
		prospectPainsSaved: extraction.prospect_pain_points.length,
		repPainsSaved: extraction.rep_pain_points.length,
		repHighlightsSaved: repHighlights.length,
	};

	logger.info({ interactionId, ...result }, "Saved extraction results");

	return result;
}
