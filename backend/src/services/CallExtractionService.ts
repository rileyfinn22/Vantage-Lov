/**
 * CallExtractionService - Extracts objections and pain points from sales call transcripts
 *
 * This service runs AFTER combined analysis and flagging, benefiting from prompt cache hits.
 * It extracts:
 * - Objections (with rep responses and effectiveness ratings)
 * - Prospect pain points (with capitalization tracking)
 * - Rep pain points (with root cause analysis)
 *
 * Each extracted item includes timestamps for training clip playback.
 */

import { z } from "zod";

// ============================================================================
// SCHEMAS
// ============================================================================

export const ExtractedObjectionSchema = z.object({
	title: z.string(),
	verbatim_quote: z.string(),
	timestamp: z.object({
		start: z.string(),
		end: z.string(),
	}),
	sales_phase: z.enum(["outreach", "discovery", "demo", "close"]),
	rep_response: z.object({
		quote: z.string(),
		effectiveness: z.enum(["overcame", "partially_addressed", "missed", "avoided"]),
		timestamp: z.object({
			start: z.string(),
			end: z.string(),
		}),
	}),
	clip_worthy_rating: z.number().min(1).max(10),
	clip_reason: z.string().nullable(),
});

// Transform various type values to the expected enum values
const painPointTypeTransform = z
	.string()
	.transform((val) => {
		const normalized = val.toLowerCase().trim();
		if (normalized.includes("prospect") || normalized === "prospect_pain") {
			return "prospect_pain" as const;
		}
		if (normalized.includes("rep") || normalized === "rep_pain") {
			return "rep_pain" as const;
		}
		return val as "prospect_pain" | "rep_pain";
	})
	.pipe(z.enum(["prospect_pain", "rep_pain"]));

export const ExtractedPainPointSchema = z.object({
	type: painPointTypeTransform,
	title: z.string(),
	verbatim_quote: z.string(),
	timestamp: z.object({
		start: z.string(),
		end: z.string(),
	}),
	sales_phase: z.enum(["outreach", "discovery", "demo", "close"]),
	// For prospect pain points
	capitalized_on: z.boolean().optional(),
	capitalization_quote: z.string().optional(),
	// For rep pain points
	root_cause: z.string().optional(),
	clip_worthy_rating: z.number().min(1).max(10),
	clip_reason: z.string().nullable(),
});

// Rep Highlights - Positive moments where rep demonstrated excellent technique
export const ExtractedRepHighlightSchema = z.object({
	skill_area: z.enum(["objection_handling", "discovery", "rapport", "pricing", "closing", "active_listening", "value_articulation"]),
	technique: z.string(),
	verbatim_quote: z.string(),
	timestamp: z.object({
		start: z.string(),
		end: z.string(),
	}),
	sales_phase: z.enum(["outreach", "discovery", "demo", "close"]),
	impact: z.string(),
	clip_worthy_rating: z.number().min(1).max(10),
	clip_reason: z.string().nullable(),
});

export const ExtractionResponseSchema = z.object({
	objections: z.array(ExtractedObjectionSchema),
	prospect_pain_points: z.array(ExtractedPainPointSchema),
	rep_pain_points: z.array(ExtractedPainPointSchema),
	rep_highlights: z.array(ExtractedRepHighlightSchema).optional().default([]),
});

export type ExtractedObjection = z.infer<typeof ExtractedObjectionSchema>;
export type ExtractedPainPoint = z.infer<typeof ExtractedPainPointSchema>;
export type ExtractedRepHighlight = z.infer<typeof ExtractedRepHighlightSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

// NOTE: The CallExtractionService class has been removed.
// Extraction is now integrated into CachedAnalysisService.
// This file is kept for the schemas which are used by other services.
