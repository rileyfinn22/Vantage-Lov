/**
 * CalibrationService - One-time extraction of patterns from example calls
 *
 * Takes full example transcripts (good/average/bad calls) and extracts:
 * - Success patterns from good calls
 * - Anti-patterns from bad calls
 * - Sales language and terminology from all calls
 *
 * These extracted patterns are stored in company_ai_context and used for
 * every future analysis (instead of including full transcripts in prompts).
 */

import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "#/lib/logger";
import { getAnthropicClient, ANTHROPIC_MODEL } from "#/lib/anthropic";
import { AI } from "#/config";

interface CalibrationInput {
	companyId: number;
	goodCall?: string;
	averageCall?: string;
	badCall?: string;
}

interface CalibrationResult {
	success: boolean;
	patternsExtracted: {
		successPatterns: number;
		antiPatterns: number;
		salesLanguage: number;
		terminology: number;
	};
	error?: string;
}

interface ExtractedPatterns {
	successPatterns: {
		topPerformerTechniques: string[];
		winningStrategies: string[];
		effectivePhrases: string[];
	};
	antiPatterns: {
		avoidPatterns: Array<{ pattern: string; reason: string }>;
		commonMistakes: Array<{ mistake: string; impact: string }>;
	};
	salesLanguage: {
		commonPhrases: Array<{ phrase: string; context: string }>;
		productTerms: Array<{ term: string; usage: string }>;
	};
	terminology: {
		glossary: Record<string, string>;
		productNames: string[];
	};
}

const CALIBRATION_PROMPT = `You are an expert sales analyst. Analyze the provided sales call transcripts and extract key patterns that will help calibrate AI analysis for this company.

You will receive up to 3 example calls:
- GOOD CALL: An exemplary call demonstrating best practices
- AVERAGE CALL: A typical call with room for improvement
- BAD CALL: A poor call illustrating what to avoid

From these calls, extract:

## 1. SUCCESS PATTERNS (from good call)
- **Top Performer Techniques**: Specific strategies that made the call successful (5-10 items)
- **Winning Strategies**: High-level approaches that work well (3-5 items)
- **Effective Phrases**: Exact phrases or word choices that landed well (5-10 items)

## 2. ANTI-PATTERNS (from bad call)
- **Patterns to Avoid**: Specific behaviors that hurt the call, with why they're problematic
- **Common Mistakes**: Higher-level errors and their impact on the sale

## 3. SALES LANGUAGE (from all calls)
- **Common Phrases**: Company-specific phrases used across calls, with context for when to use them
- **Product Terms**: How the company talks about their product/service

## 4. TERMINOLOGY (from all calls)
- **Glossary**: Industry or company-specific terms and their meanings
- **Product Names**: Names of products, services, features mentioned

Respond with ONLY valid JSON matching this exact structure:
{
  "successPatterns": {
    "topPerformerTechniques": ["technique 1", "technique 2", ...],
    "winningStrategies": ["strategy 1", "strategy 2", ...],
    "effectivePhrases": ["phrase 1", "phrase 2", ...]
  },
  "antiPatterns": {
    "avoidPatterns": [
      {"pattern": "behavior to avoid", "reason": "why it's problematic"},
      ...
    ],
    "commonMistakes": [
      {"mistake": "what went wrong", "impact": "effect on the sale"},
      ...
    ]
  },
  "salesLanguage": {
    "commonPhrases": [
      {"phrase": "exact phrase", "context": "when to use it"},
      ...
    ],
    "productTerms": [
      {"term": "product/service name", "usage": "how it's typically described"},
      ...
    ]
  },
  "terminology": {
    "glossary": {
      "term": "definition",
      ...
    },
    "productNames": ["name1", "name2", ...]
  }
}

If a call type is not provided, extract what you can from the available calls.
Focus on extractable, actionable patterns - not generic advice.`;

/**
 * Run calibration to extract patterns from example calls
 */
export async function runCalibration(input: CalibrationInput): Promise<CalibrationResult> {
	const { companyId, goodCall, averageCall, badCall } = input;

	if (!goodCall && !averageCall && !badCall) {
		return {
			success: false,
			patternsExtracted: { successPatterns: 0, antiPatterns: 0, salesLanguage: 0, terminology: 0 },
			error: "At least one example call must be provided",
		};
	}

	logger.info({ companyId, hasGood: !!goodCall, hasAverage: !!averageCall, hasBad: !!badCall }, "Starting calibration");

	try {
		// Build the user message with available calls
		const callSections: string[] = [];

		if (goodCall) {
			callSections.push(`## GOOD CALL TRANSCRIPT\n\n${goodCall}`);
		}
		if (averageCall) {
			callSections.push(`## AVERAGE CALL TRANSCRIPT\n\n${averageCall}`);
		}
		if (badCall) {
			callSections.push(`## BAD CALL TRANSCRIPT\n\n${badCall}`);
		}

		const userMessage = callSections.join("\n\n---\n\n");

		// Call Claude to extract patterns
		const response = await getAnthropicClient().messages.create({
			model: ANTHROPIC_MODEL,
			max_tokens: AI.MAX_TOKENS.CALIBRATION,
			messages: [
				{
					role: "user",
					content: `${CALIBRATION_PROMPT}\n\n---\n\n${userMessage}`,
				},
			],
		});

		// Parse the response
		const textContent = response.content.find((block) => block.type === "text");
		if (!textContent || textContent.type !== "text") {
			throw new Error("No text response from AI");
		}

		// Extract JSON from response (handle markdown code blocks)
		let jsonStr = textContent.text;
		const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch) {
			jsonStr = jsonMatch[1];
		}

		const patterns: ExtractedPatterns = JSON.parse(jsonStr.trim());

		// Store extracted patterns in company_ai_context
		const results = await storeExtractedPatterns(companyId, patterns);

		logger.info({ companyId, results }, "Calibration complete");

		return {
			success: true,
			patternsExtracted: results,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		logger.error({ companyId, error }, "Calibration failed");

		return {
			success: false,
			patternsExtracted: { successPatterns: 0, antiPatterns: 0, salesLanguage: 0, terminology: 0 },
			error: errorMessage,
		};
	}
}

/**
 * Store extracted patterns in company_ai_context table
 */
async function storeExtractedPatterns(
	companyId: number,
	patterns: ExtractedPatterns,
): Promise<{ successPatterns: number; antiPatterns: number; salesLanguage: number; terminology: number }> {
	const results = {
		successPatterns: 0,
		antiPatterns: 0,
		salesLanguage: 0,
		terminology: 0,
	};

	// Helper to upsert context
	async function upsertContext(
		contextType: (typeof schema.aiContextTypes.enumValues)[number],
		data: Record<string, unknown>,
		sampleSize: number,
	) {
		const existing = await db
			.select()
			.from(schema.companyAiContext)
			.where(and(eq(schema.companyAiContext.companyId, companyId), eq(schema.companyAiContext.contextType, contextType)))
			.limit(1);

		if (existing.length > 0) {
			await db
				.update(schema.companyAiContext)
				.set({
					data,
					confidence: "0.9000", // High confidence for manual calibration
					sampleSize,
					lastUpdated: new Date(),
				})
				.where(eq(schema.companyAiContext.id, existing[0].id));
		} else {
			await db.insert(schema.companyAiContext).values({
				companyId,
				contextType,
				data,
				confidence: "0.9000",
				sampleSize,
			});
		}
	}

	// Store success patterns
	if (patterns.successPatterns) {
		const totalItems =
			(patterns.successPatterns.topPerformerTechniques?.length ?? 0) +
			(patterns.successPatterns.winningStrategies?.length ?? 0) +
			(patterns.successPatterns.effectivePhrases?.length ?? 0);

		if (totalItems > 0) {
			await upsertContext("success_patterns", patterns.successPatterns, totalItems);
			results.successPatterns = totalItems;
		}
	}

	// Store anti-patterns
	if (patterns.antiPatterns) {
		const totalItems = (patterns.antiPatterns.avoidPatterns?.length ?? 0) + (patterns.antiPatterns.commonMistakes?.length ?? 0);

		if (totalItems > 0) {
			await upsertContext("anti_patterns", { avoidPatterns: patterns.antiPatterns.avoidPatterns ?? [] }, totalItems);
			results.antiPatterns = totalItems;
		}
	}

	// Store sales language
	if (patterns.salesLanguage) {
		const totalItems = (patterns.salesLanguage.commonPhrases?.length ?? 0) + (patterns.salesLanguage.productTerms?.length ?? 0);

		if (totalItems > 0) {
			await upsertContext(
				"sales_language",
				{
					commonPhrases: patterns.salesLanguage.commonPhrases?.map((p) => ({ phrase: p.phrase, count: 1 })) ?? [],
					productTerms: patterns.salesLanguage.productTerms?.map((t) => ({ term: t.term, count: 1 })) ?? [],
				},
				totalItems,
			);
			results.salesLanguage = totalItems;
		}
	}

	// Store terminology
	if (patterns.terminology) {
		const glossarySize = Object.keys(patterns.terminology.glossary ?? {}).length;
		const productNamesSize = patterns.terminology.productNames?.length ?? 0;
		const totalItems = glossarySize + productNamesSize;

		if (totalItems > 0) {
			await upsertContext("terminology", patterns.terminology, totalItems);
			results.terminology = totalItems;
		}
	}

	return results;
}

/**
 * Get calibration status for a company
 */
export async function getCalibrationStatus(companyId: number): Promise<{
	hasCalibrated: boolean;
	lastCalibrated?: Date;
	patternsCount: {
		successPatterns: number;
		antiPatterns: number;
		salesLanguage: number;
		terminology: number;
	};
}> {
	const contexts = await db.select().from(schema.companyAiContext).where(eq(schema.companyAiContext.companyId, companyId));

	const patternsCount = {
		successPatterns: 0,
		antiPatterns: 0,
		salesLanguage: 0,
		terminology: 0,
	};

	let lastCalibrated: Date | undefined;

	for (const ctx of contexts) {
		const sampleSize = ctx.sampleSize;
		const updated = ctx.lastUpdated;

		if (!lastCalibrated || updated > lastCalibrated) {
			lastCalibrated = updated;
		}

		switch (ctx.contextType) {
			case "success_patterns":
				patternsCount.successPatterns = sampleSize;
				break;
			case "anti_patterns":
				patternsCount.antiPatterns = sampleSize;
				break;
			case "sales_language":
				patternsCount.salesLanguage = sampleSize;
				break;
			case "terminology":
				patternsCount.terminology = sampleSize;
				break;
		}
	}

	const hasCalibrated = Object.values(patternsCount).some((count) => count > 0);

	return {
		hasCalibrated,
		lastCalibrated,
		patternsCount,
	};
}
