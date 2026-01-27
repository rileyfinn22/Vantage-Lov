import { db, computeRawInteractionText } from "#/data";
import * as schema from "#/data/schema";
import { eq } from "drizzle-orm";
import { CompanyAIContextService } from "#/services/CompanyAIContextService";
import { getCachedAnalysisService } from "#/services/CachedAnalysisService";
import { saveExtractionResults } from "#/services/ExtractionStorageService";
import { logger } from "#/lib/logger";
import { selectPromptWithFallback } from "#/vantage/slopAsker.db";
import {
	RATING_SYSTEM_INSTRUCTIONS,
	FLAGGING_SYSTEM_INSTRUCTIONS,
	EXTRACTION_SYSTEM_INSTRUCTIONS,
	PERSONA_SYSTEM_INSTRUCTIONS,
} from "#/lib/prompt/analysis-defaults";

export type InteractionContextPack = {
	interactionId: number;
	salespersonId: number | null;
	companyId: number | null;
	textToAnalyze: string;
	companyContextFormatted?: string;
};

export type AnalysisPromptPack = {
	ratingPromptText: string;
	flaggingPromptText: string;
	extractionPromptText: string;
	personaPromptText: string;
};

export type BranchedAnalysisResult = {
	rating: any | null;
	flagging: any | null;
	extraction: any | null;
	personaWithRoleplay: any | null;
};

/**
 * Load the interaction transcript text, associated salesperson/company IDs, and formatted company context (if available).
 * This function is intentionally deterministic and side-effect free.
 */
export async function loadInteractionContext(params: { interactionId: number }): Promise<InteractionContextPack> {
	const { interactionId } = params;

	// Fetch full interaction data + salesperson
	const interactionData = await db
		.select()
		.from(schema.interactions)
		.leftJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
		.where(eq(schema.interactions.id, interactionId))
		.limit(1);

	const row = interactionData[0];
	if (!row) {
		throw new Error("Interaction not found.");
	}

	// @ts-expect-error drizzle join shape
	const interaction = row.interactions ?? row;
	// @ts-expect-error drizzle join shape
	const salesperson = row.salespeople;

	const textToAnalyze = computeRawInteractionText(interaction.interactions);
	if (!textToAnalyze || textToAnalyze.trim().length < 20) {
		throw new Error("Transcript text too short / empty.");
	}

	const companyId: number | null = salesperson?.companyId ?? null;
	const salespersonId: number | null = interaction.salespersonId ?? null;

	let companyContextFormatted: string | undefined;
	if (companyId) {
		try {
			const companyContext = await CompanyAIContextService.loadCompanyContext(companyId);
			companyContextFormatted = CompanyAIContextService.formatContextForPrompt(companyContext);
		} catch (error) {
			logger.warn({ error, interactionId, companyId }, "Failed to load company context");
		}
	}

	return { interactionId, salespersonId, companyId, textToAnalyze, companyContextFormatted };
}

/**
 * Load the current analysis prompt variants (rating/flagging/extraction/persona) using DB overrides with fallbacks.
 * Deterministic and side-effect free.
 */
export async function loadAnalysisPrompts(): Promise<AnalysisPromptPack> {
	async function getPrompt(promptType: "rating" | "flagging" | "extraction" | "call_persona"): Promise<string> {
		switch (promptType) {
			case "rating":
				return selectPromptWithFallback("rating", RATING_SYSTEM_INSTRUCTIONS);
			case "flagging":
				return selectPromptWithFallback("flagging", FLAGGING_SYSTEM_INSTRUCTIONS);
			case "extraction":
				return selectPromptWithFallback("extraction", EXTRACTION_SYSTEM_INSTRUCTIONS);
			case "call_persona":
				return selectPromptWithFallback("call_persona", PERSONA_SYSTEM_INSTRUCTIONS);
		}
	}

	const [ratingPromptText, flaggingPromptText, extractionPromptText, personaPromptText] = await Promise.all([
		getPrompt("rating"),
		getPrompt("flagging"),
		getPrompt("extraction"),
		getPrompt("call_persona"),
	]);

	return { ratingPromptText, flaggingPromptText, extractionPromptText, personaPromptText };
}

/**
 * Run the cached "branched + roleplay" analysis (LLM call). No DB writes here.
 */
export async function runBranchedAnalysis(params: {
	interactionId: number;
	textToAnalyze: string;
	companyContextFormatted?: string;
	prompts: AnalysisPromptPack;
}): Promise<BranchedAnalysisResult> {
	const cachedService = getCachedAnalysisService();
	if (!cachedService) {
		throw new Error("CachedAnalysisService not initialized (missing ANTHROPIC_API_KEY).");
	}

	const results = await cachedService.analyzeTranscriptBranchedWithRoleplay(
		params.textToAnalyze,
		params.companyContextFormatted,
		{
			rating: params.prompts.ratingPromptText,
			flagging: params.prompts.flaggingPromptText,
			extraction: params.prompts.extractionPromptText,
			persona: params.prompts.personaPromptText,
		},
		String(params.interactionId),
	);

	return {
		rating: results.rating ?? null,
		flagging: results.flagging ?? null,
		extraction: results.extraction ?? null,
		personaWithRoleplay: results.personaWithRoleplay ?? null,
	};
}

/**
 * Persist the rating result.
 */
export async function persistRating(params: { interactionId: number; overallRating: number }): Promise<{ saved: boolean }> {
	await db.insert(schema.ratings).values({
		interactionId: params.interactionId,
		type: "ollama",
		value: params.overallRating,
	});
	return { saved: true };
}

/**
 * Persist flags and attach pre-generated roleplay prompt when available.
 */
export async function persistFlags(params: {
	interactionId: number;
	salespersonId: number | null;
	flags: any[];
	flagRoleplays?: any[];
}): Promise<{ savedCount: number }> {
	const { interactionId, salespersonId, flags, flagRoleplays = [] } = params;
	let savedCount = 0;

	for (const flag of flags) {
		const matchingRoleplay = flagRoleplays.find((rp: any) => rp.flagTitle === flag.flag_title);
		await db.insert(schema.flags).values({
			interactionId,
			associatedSalespersonId: salespersonId,
			flagData: flag,
			source: "ollama",
			complete: false,
			agentPrompt: matchingRoleplay
				? {
					systemPrompt: matchingRoleplay.systemPrompt,
					firstMessage: matchingRoleplay.firstMessage,
					voiceId: matchingRoleplay.voiceId,
					model: matchingRoleplay.model,
					metadata: {
						prospect: matchingRoleplay.metadata,
						flagMoment: {
							issueType: flag.flag_title,
							whatCustomerSaid: flag.prospect_said ?? "",
							whatWentWrong: flag.revenue_impact,
						},
					},
				}
				: null,
		});
		savedCount += 1;
	}

	return { savedCount };
}

/**
 * Persist extraction results.
 */
export async function persistExtraction(params: { interactionId: number; companyId: number; extraction: any }): Promise<{ saved: boolean }> {
	await saveExtractionResults(params.interactionId, params.companyId, params.extraction);
	return { saved: true };
}

/**
 * Persist call persona result.
 */
export async function persistPersona(params: { interactionId: number; companyId: number; persona: any }): Promise<{ saved: boolean }> {
	const p = params.persona ?? {};
	await db.insert(schema.callPersonas).values({
		interactionId: params.interactionId,
		companyId: params.companyId,
		prospectName: p.name ?? null,
		prospectCompany: p.company ?? null,
		prospectRole: p.role ?? null,
		prospectIndustry: p.industry ?? null,
		coreIdentity: p.core_identity ?? null,
		processingStyle: p.how_they_process_information ?? null,
		decisionStyle: p.how_they_make_decisions ?? null,
		communicationPreferences: p.communication_preferences ?? null,
		socialStyle: p.social_style ?? null,
		emotionalDrivers: p.emotional_drivers ?? null,
		confidenceLevel: p.confidence_level ?? null,
		trustTriggers: p.trust_triggers ?? null,
		skepticismTriggers: p.skepticism_triggers ?? null,
		primaryMotivations: p.primary_motivations ?? null,
		fearOfLoss: p.fear_of_loss ?? null,
		statusOrientation: p.status_orientation ?? null,
		changeTolerance: p.change_tolerance ?? null,
		relationshipToRisk: p.relationship_to_risk ?? null,
		valueSignals: p.value_signals ?? null,
		whatTheyCareAboutMost: p.what_they_care_about_most ?? null,
		whatTheyNeedToHear: p.what_they_need_to_hear ?? null,
		theirMainObjectionStyle: p.their_main_objection_style ?? null,
		theirPreferredSalesApproach: p.their_preferred_sales_approach ?? null,
	});
	return { saved: true };
}

/**
 * Convenience wrapper: full end-to-end pipeline with persistence.
 * This keeps compatibility for any non-agentic callers.
 */
export async function processInteractionBranchedPipeline(params: {
	interactionId: number;
}): Promise<{
	ok: boolean;
	interactionId: number;
	saved: { rating: boolean; flags: number; extraction: boolean; persona: boolean };
	notes: string;
}> {
	const { interactionId } = params;

	try {
		const ctx = await loadInteractionContext({ interactionId });
		const prompts = await loadAnalysisPrompts();
		const analysis = await runBranchedAnalysis({
			interactionId,
			textToAnalyze: ctx.textToAnalyze,
			companyContextFormatted: ctx.companyContextFormatted,
			prompts,
		});

		const { rating, flagging, extraction, personaWithRoleplay } = analysis;
		const persona = personaWithRoleplay?.persona;
		const flagRoleplays = personaWithRoleplay?.flagRoleplays ?? [];

		let savedRating = false;
		let savedFlags = 0;
		let savedExtraction = false;
		let savedPersona = false;

		if (rating?.overall_rating != null) {
			await persistRating({ interactionId, overallRating: rating.overall_rating });
			savedRating = true;
		}

		if (flagging?.flags?.length) {
			const res = await persistFlags({
				interactionId,
				salespersonId: ctx.salespersonId,
				flags: flagging.flags,
				flagRoleplays,
			});
			savedFlags = res.savedCount;
		}

		if (extraction && ctx.companyId) {
			try {
				await persistExtraction({ interactionId, companyId: ctx.companyId, extraction });
				savedExtraction = true;
			} catch (error) {
				logger.error({ error, interactionId, companyId: ctx.companyId }, "Failed to save extraction");
			}
		}

		if (persona && ctx.companyId) {
			try {
				await persistPersona({ interactionId, companyId: ctx.companyId, persona });
				savedPersona = true;
			} catch (error) {
				logger.error({ error, interactionId, companyId: ctx.companyId }, "Failed to save persona");
			}
		}

		return {
			ok: savedRating,
			interactionId,
			saved: { rating: savedRating, flags: savedFlags, extraction: savedExtraction, persona: savedPersona },
			notes: "Processed interaction branched pipeline.",
		};
	} catch (error: any) {
		return {
			ok: false,
			interactionId,
			saved: { rating: false, flags: 0, extraction: false, persona: false },
			notes: error?.message ?? "Failed to process interaction branched pipeline.",
		};
	}
}
