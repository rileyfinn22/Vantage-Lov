import { db, computeRawInteractionText } from "#/data";
import * as schema from "#/data/schema";
import { eq, isNull, and, sql, notExists, lt } from "drizzle-orm";
import z from "zod";
import { trainingFlagPrompt, trainingSkillsPrompt, trainingBattleCardPrompt, trainingRoleplayPrompt } from "#/lib/prompt/v1";
// Import system instructions from analysis-defaults (used for fallbacks)
import {
	RATING_SYSTEM_INSTRUCTIONS,
	FLAGGING_SYSTEM_INSTRUCTIONS,
	EXTRACTION_SYSTEM_INSTRUCTIONS,
	PERSONA_SYSTEM_INSTRUCTIONS,
} from "#/lib/prompt/analysis-defaults";
import { logger } from "#/lib/logger";
import { selectPromptWithFallback } from "./slopAsker.db";
import { CompanyAIContextService } from "#/services/CompanyAIContextService";
import { getCachedAnalysisService } from "#/services/CachedAnalysisService";
import { saveExtractionResults } from "#/services/ExtractionStorageService";
import { autoGenerateBattleCardsForCompany } from "#/services/BattleCardGenerationService";
import { AgenticFeatureOrchestrationService } from "#/services/AgenticFeatureOrchestrationService";
import { TIMING } from "#/config";
// Combined rating and skills assessment response - matches updated prompt format
const RatingWithSkillsResponse = z.object({
	// Call context inference
	call_context: z.object({
		inferred_call_type: z.enum(["discovery", "demo", "negotiation", "closing", "follow-up"]).describe("Inferred call type"),
		call_stage: z.enum(["early", "mid", "late"]).describe("Call stage in sales cycle"),
		primary_objective: z.string().describe("What the rep was trying to accomplish"),
	}),

	// Overall call rating (1-100) - note: changed from 0-100 to match prompt
	overall_rating: z.number().int().min(1).max(100).describe("Overall call quality rating (1-100)"),

	// Individual skill scores (1-10 or "N/A")
	skills: z.object({
		objection_handling: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]).describe("Objection handling skill (1-10 or N/A)"),
			evidence: z.string().describe("Specific quote or moment from transcript"),
			missed_opportunity: z.string().nullable().describe("What could have been done better, or null"),
		}),
		pricing_discussions: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]).describe("Pricing discussion skill (1-10 or N/A)"),
			evidence: z.string().describe("Specific quote or moment from transcript"),
			missed_opportunity: z.string().nullable().describe("What could have been done better, or null"),
		}),
		discovery_needs_analysis: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]).describe("Discovery & needs analysis skill (1-10 or N/A)"),
			evidence: z.string().describe("Specific quote or moment from transcript"),
			missed_opportunity: z.string().nullable().describe("What could have been done better, or null"),
		}),
		closing_next_steps: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]).describe("Closing & next steps skill (1-10 or N/A)"),
			evidence: z.string().describe("Specific quote or moment from transcript"),
			missed_opportunity: z.string().nullable().describe("What could have been done better, or null"),
		}),
	}),

	// Red flags
	red_flags: z.array(z.string()).describe("Array of observed red flags"),

	// Rep summary
	rep_summary: z.string().describe("2-3 sentence analysis of rep's performance"),
	top_strength: z.string().describe("Single most impressive skill demonstrated"),
	priority_improvement: z.string().describe("Single most critical skill to develop"),
});

const FlagResponse = z.object({
	revision: z.literal("v1").describe("Schema version"),
	flag_title: z
		.string()
		.describe(
			"A descriptive title (5-7 words) that captures the specific behavior issue and its impact (e.g., 'Failed to Address Budget Objection Directly', 'Skipped Discovery Before Product Demo')",
		),
	confidenceOutOf100: z.int().min(0).max(100).describe("Confidence level of this flag (0-100)"),
	validation_checklist: z.array(z.string()).describe("Array of validation criteria that passed"),
	what_happened: z.string().describe("Summary of what occurred in this moment"),
	prospect_said: z
		.string()
		.describe("What the prospect/customer said in this moment - 2-4 sentences capturing the full context of their statement"),
	rep_said: z.string().describe("What the rep/salesperson said in response - 2-4 sentences capturing the full context of their response"),
	revenue_impact: z.string().describe("How this behavior affected revenue potential"),
	better_response: z
		.array(z.string())
		.describe("Array of 2 specific response options the rep could use verbatim. Each should be 2-3 sentences, direct and actionable."),
	benchmarking_context: z.string().describe("Reference to top performer standards"),
	pattern_analysis: z.string().optional().describe("Recurrence or frequency information (optional)"),
	role_expectation: z.string().describe("Appropriate coaching level for this rep's experience"),
	why_this_matters: z.string().describe("The skill development impact"),
	timestamps: z
		.object({
			start: z.string().optional().describe("Start time of the flagged moment (e.g., '00:12:34')"),
			end: z.string().optional().describe("End time of the flagged moment (e.g., '00:13:45')"),
		})
		.describe("Time markers for when the flagged moment occurred"),
	transcript_segment: z
		.array(z.string())
		.optional()
		.describe("The relevant conversation lines from this flagged moment, formatted as 'Speaker: text' for each line"),
});

/**
 * Prompt key types for the system
 * - rating: Rates overall call quality and skills (1-100 + 4 sub-scores)
 * - flagging: Identifies coaching flags per call
 * - extraction: Extracts objections, pain points with timestamps, and battle cards
 * - call_persona: Extracts persona from EVERY call (stored in call_personas table)
 * - training_flag: Flag-based training roleplay (uses exact persona from that call)
 * - training_skills: Skills assessment roleplay (uses synthesized personas from library)
 * - training_battle_card: Battle card training roleplay (uses synthesized personas + battle cards)
 * - training_roleplay: Meta-prompt for generating roleplay personas from transcript context
 * - training_scenario: Legacy - renamed to training_skills
 * - flag_persona: Legacy - renamed to call_persona
 */
export type PromptKey =
	| "rating" // 1st analysis - cache write
	| "flagging" // 2nd analysis - cache hit
	| "extraction" // 3rd analysis - includes battle cards, cache hit
	| "call_persona" // 4th analysis - extracts persona from EVERY call, cache hit
	| "training_flag" // Uses exact persona from call_persona for that call
	| "training_skills" // Uses synthesized personas from call_personas library
	| "training_battle_card" // Uses synthesized personas + battle cards
	| "training_roleplay" // 5th API call - generates roleplay persona from transcript context
	| "training_scenario" // Legacy
	| "flag_persona"; // Legacy - renamed to call_persona

// Helper function to fetch prompts from database with fallback logic
export async function getPrompt(key: PromptKey): Promise<string> {
	try {
		const value = await selectPromptWithFallback(key);

		if (value) {
			return typeof value === "string" ? value : JSON.stringify(value);
		}
	} catch (error) {
		logger.warn({ error, key }, "Failed to fetch prompt from database, using fallback");
	}

	// Fallback to built-in defaults based on prompt type
	// Use actual agent system instructions for analysis prompts (what's ACTUALLY used)
	switch (key) {
		case "rating":
			return RATING_SYSTEM_INSTRUCTIONS;
		case "flagging":
			return FLAGGING_SYSTEM_INSTRUCTIONS;
		case "extraction":
			return EXTRACTION_SYSTEM_INSTRUCTIONS;
		case "call_persona":
			// 4th analysis call - extracts persona from EVERY call (not just flagged)
			return PERSONA_SYSTEM_INSTRUCTIONS;
		case "flag_persona":
			// Legacy - redirect to call_persona
			return PERSONA_SYSTEM_INSTRUCTIONS;
		case "training_flag":
			// Uses pre-extracted persona data (does NOT run on transcript)
			return trainingFlagPrompt();
		case "training_skills":
			return trainingSkillsPrompt();
		case "training_battle_card":
			return trainingBattleCardPrompt();
		case "training_roleplay":
			return trainingRoleplayPrompt();
		case "training_scenario":
			// Legacy - redirect to training_skills
			return trainingSkillsPrompt();
	}
}

export async function lookForUnratedInteractions() {
	const cachedService = getCachedAnalysisService();

	if (!cachedService) {
		logger.error("CachedAnalysisService not initialized - missing ANTHROPIC_API_KEY");
		return;
	}

	logger.info("Using CachedAnalysisService with Anthropic prompt caching");
	return lookForUnratedInteractionsCached(cachedService);
}

// Branched workflow with integrated roleplay: Rating (cache write) → Flagging (cache hit) → [Extraction, Persona+Roleplay] in parallel
// 4 API calls total: 1 cache write + 1 flagging + 2 parallel cache hits (extraction + persona+roleplay)
// This eliminates separate per-flag API calls by having persona generate roleplay prompts for all flags
async function lookForUnratedInteractionsCached(cachedService: NonNullable<ReturnType<typeof getCachedAnalysisService>>) {
	// Recover stale claims - reset interactions stuck in "processing" for more than the threshold
	// This handles crashes/restarts that leave interactions orphaned
	// Using createdAt as proxy since analysis should complete within minutes of upload
	const staleThreshold = new Date(Date.now() - TIMING.STALE_INTERACTION_THRESHOLD_MS);

	const staleInteractions = await db
		.update(schema.interactions)
		.set({ processedStatus: "processed" })
		.where(and(eq(schema.interactions.processedStatus, "processing"), lt(schema.interactions.createdAt, staleThreshold)))
		.returning();

	if (staleInteractions.length > 0) {
		logger.warn(
			{ count: staleInteractions.length, ids: staleInteractions.map((i) => i.id) },
			"Recovered stale interactions stuck in processing state",
		);
	}

	// Use atomic claim pattern to prevent race conditions
	const claimedInteractions = await db
		.update(schema.interactions)
		.set({ processedStatus: "processing" })
		.where(
			and(
				eq(schema.interactions.processedStatus, "processed"),
				notExists(
					db.select({ id: schema.ratings.id }).from(schema.ratings).where(eq(schema.ratings.interactionId, schema.interactions.id)),
				),
			),
		)
		.returning();

	if (claimedInteractions.length === 0) {
		return; // No work to do
	}

	logger.info({ count: claimedInteractions.length }, "Claimed interactions for processing (branched workflow - 4 API calls)");

	for (const claimed of claimedInteractions) {
		const interactionId = claimed.id;

		// Fetch full interaction data
		const interactionData = await db
			.select()
			.from(schema.interactions)
			.leftJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
			.where(eq(schema.interactions.id, interactionId))
			.limit(1);

		const interaction = interactionData[0];
		if (!interaction) {
			logger.warn({ interactionId }, "Claimed interaction not found - skipping");
			continue;
		}

		const textToAnalyze = computeRawInteractionText(interaction.interactions);
		const companyId = interaction.salespeople?.companyId;

		try {
			// Agentic platform (Supervisor + sub-agents) path for the entire interaction pipeline
			if (process.env.AGENTIC_INTERACTION_PIPELINE === "true") {
				await AgenticFeatureOrchestrationService.run({
					feature: "interaction_branched_pipeline",
					input: { interactionId },
					ctx: { userId: interaction.interactions.associatedUserId ?? 0, companyId: companyId ?? null } as any,
					config: { budgets: { maxIterations: 10, maxToolCalls: 12, maxTimeMs: 120_000 } },
				});
				// Mark processed and continue
				await db.update(schema.interactions).set({ processedStatus: "processed" }).where(eq(schema.interactions.id, interactionId));
				continue;
			}

			// STEP 1: Load company context (The Brain)
			let companyContextFormatted: string | undefined;
			if (companyId) {
				try {
					const companyContext = await CompanyAIContextService.loadCompanyContext(companyId);
					companyContextFormatted = CompanyAIContextService.formatContextForPrompt(companyContext);
					logger.info({ interactionId, companyId }, "Loaded company brain context");
				} catch (error) {
					logger.warn({ error, interactionId, companyId }, "Failed to load company context");
				}
			}

			// STEP 2: Get all prompts
			const [ratingPromptText, flaggingPromptText, extractionPromptText, personaPromptText] = await Promise.all([
				getPrompt("rating"),
				getPrompt("flagging"),
				getPrompt("extraction"),
				getPrompt("call_persona"),
			]);

			// STEP 3: Run branched analysis with integrated roleplay
			// Rating runs first (cache write), then Flagging (cache hit), then Extraction/Persona+Roleplay in parallel
			// This eliminates separate per-flag API calls by having persona generate roleplay prompts for all flags
			logger.info(
				{ interactionId },
				"Starting branched analysis with roleplay (rating → flagging → [extraction, persona+roleplay] in parallel)",
			);
			const results = await cachedService.analyzeTranscriptBranchedWithRoleplay(
				textToAnalyze,
				companyContextFormatted,
				{
					rating: ratingPromptText,
					flagging: flaggingPromptText,
					extraction: extractionPromptText,
					persona: personaPromptText,
				},
				String(interactionId),
			);

			// STEP 4: Process and save results
			const { rating, flagging, extraction, personaWithRoleplay } = results;
			// Extract the persona, roleplay prompts, and call summary from the combined result
			const persona = personaWithRoleplay?.persona;
			const flagRoleplays = personaWithRoleplay?.flagRoleplays ?? [];
			const callSummary = personaWithRoleplay?.callSummary;

			if (rating) {
				logger.info(
					{
						interactionId,
						rating: rating.overall_rating,
						callType: rating.call_context.inferred_call_type,
						hasFlagging: !!flagging,
						hasPersona: !!persona,
					},
					"Completed branched analysis",
				);

				// Save rating
				await db.insert(schema.ratings).values({
					interactionId,
					type: "ollama",
					value: rating.overall_rating,
					blurb: rating.rep_summary,
				});

				// Save skills assessment
				const normalizeScore = (score: number | "N/A"): number => (score === "N/A" ? 0 : score);

				await db.insert(schema.skillsAssessments).values({
					interactionId,
					objectionHandlingScore: normalizeScore(rating.skills.objection_handling.score),
					pricingDiscussionsScore: normalizeScore(rating.skills.pricing_discussions.score),
					discoveryFeaturesScore: normalizeScore(rating.skills.discovery_needs_analysis.score),
					closingScore: normalizeScore(rating.skills.closing_next_steps.score),
					assessmentData: {
						skills: rating.skills,
						call_context: rating.call_context,
						red_flags: rating.red_flags,
						top_strength: rating.top_strength,
						priority_improvement: rating.priority_improvement,
					},
				});

				// Type the persona for saving and roleplay generation
				const typedPersona = persona as
					| {
							name?: string;
							company?: string;
							role?: string;
							industry?: string;
							core_identity?: string;
							how_they_process_information?: string;
							filler_words?: string[];
							speaking_style?: string;
							psychological_state?: string;
							feeling_beneath_surface?: string;
							what_learned_about_salespeople?: string;
							what_earns_respect?: string;
							what_triggers_shutdown?: string;
							internal_narrator?: string;
							bullshit_detector?: string;
							engagement_thermostat?: string;
							knowledge_not_shared?: string;
							mental_model_of_problem?: string;
							resolution_positive?: string;
							resolution_negative?: string;
					  }
					| undefined;

				// Process flagging results and use pre-generated roleplay prompts from persona step
				if (flagging) {
					logger.info(
						{ interactionId, flagCount: flagging.flags.length, roleplayCount: flagRoleplays.length },
						"Processing flags with integrated roleplay",
					);

					for (const flag of flagging.flags ?? []) {
						// Find matching roleplay prompt from the persona step (by flag title)
						const matchingRoleplay = flagRoleplays.find((rp) => rp.flagTitle === flag.flag_title);

						// Insert the flag with roleplay prompt (if available)
						const insertedFlags = await db
							.insert(schema.flags)
							.values({
								interactionId,
								associatedSalespersonId: interaction.interactions.salespersonId,
								flagData: flag,
								source: "ollama",
								complete: false,
								// Use pre-generated roleplay prompt from persona step (no separate API call needed)
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
							})
							.returning();

						const insertedFlag = insertedFlags[0];
						if (insertedFlag) {
							logger.info(
								{
									interactionId,
									flagId: insertedFlag.id,
									hasRoleplay: !!matchingRoleplay,
									prospectName: matchingRoleplay?.metadata?.name,
								},
								matchingRoleplay
									? "Stored flag with pre-generated roleplay prompt (no extra API call)"
									: "Stored flag without roleplay prompt (no match found)",
							);
						}
					}
				}

				// Save extraction results (already ran in parallel with flagging/persona)
				if (extraction && companyId) {
					try {
						await saveExtractionResults(interactionId, companyId, extraction);
						logger.info(
							{
								interactionId,
								objections: extraction.objections?.length ?? 0,
								prospectPains: extraction.prospect_pain_points?.length ?? 0,
								repPains: extraction.rep_pain_points?.length ?? 0,
							},
							"Saved extraction results",
						);
					} catch (error) {
						const errorInfo =
							error instanceof Error
								? { message: error.message, name: error.name, stack: error.stack?.split("\n").slice(0, 5).join("\n") }
								: error;
						logger.error({ interactionId, errorInfo }, "Failed to save extraction - continuing");
					}
				}

				// Update interaction with notes and persona
				const notesUpdate: Record<string, Record<string, unknown>> = {};

				if (flagging) {
					notesUpdate.flagging = { branched: true, flagCount: flagging.flags.length };
				}

				if (typedPersona) {
					notesUpdate.psychological_persona = typedPersona;

					// Save persona to call_personas table for training lookup
					if (companyId) {
						try {
							await db.insert(schema.callPersonas).values({
								interactionId,
								companyId,
								// Prospect info
								prospectName: typedPersona.name ?? null,
								prospectCompany: typedPersona.company ?? null,
								prospectRole: typedPersona.role ?? null,
								prospectIndustry: typedPersona.industry ?? null,
								// Psychological persona (for authentic roleplay)
								coreIdentity: typedPersona.core_identity ?? null,
								processingStyle: typedPersona.how_they_process_information ?? null,
								fillerWords: typedPersona.filler_words ?? null,
								speakingStyle: typedPersona.speaking_style ?? null,
								psychologicalState: typedPersona.psychological_state ?? null,
								feelingBeneathSurface: typedPersona.feeling_beneath_surface ?? null,
								whatLearnedAboutSalespeople: typedPersona.what_learned_about_salespeople ?? null,
								whatEarnsRespect: typedPersona.what_earns_respect ?? null,
								whatTriggersShutdown: typedPersona.what_triggers_shutdown ?? null,
								internalNarrator: typedPersona.internal_narrator ?? null,
								bullshitDetector: typedPersona.bullshit_detector ?? null,
								engagementThermostat: typedPersona.engagement_thermostat ?? null,
								knowledgeNotShared: typedPersona.knowledge_not_shared ?? null,
								mentalModelOfProblem: typedPersona.mental_model_of_problem ?? null,
								resolutionPositive: typedPersona.resolution_positive ?? null,
								resolutionNegative: typedPersona.resolution_negative ?? null,
							});
							logger.info({ interactionId, companyId, personaName: typedPersona.name }, "Saved persona to call_personas table");
						} catch (error) {
							logger.error({ interactionId, companyId, error }, "Failed to save persona to call_personas table");
							// Don't fail the whole pipeline if persona save fails
						}
					}
				}

				// Build metadata from persona and call summary
				// Convert snake_case from API to camelCase for frontend
				const summaryForMetadata = callSummary
					? {
							overview: callSummary.overview,
							topicsDiscussed: callSummary.topics_discussed,
							outcome: callSummary.outcome,
							nextSteps: callSummary.next_steps,
							keyMoments: callSummary.key_moments,
						}
					: undefined;

				const metadataUpdate =
					typedPersona || summaryForMetadata
						? {
								prospect: typedPersona
									? {
											name: typedPersona.name,
											company: typedPersona.company,
											title: typedPersona.role,
										}
									: undefined,
								company: typedPersona
									? {
											industry: typedPersona.industry,
										}
									: undefined,
								summary: summaryForMetadata,
							}
						: null;

				await db
					.update(schema.interactions)
					.set({
						notes: notesUpdate,
						metadata: metadataUpdate,
						processedStatus: "processed",
					})
					.where(eq(schema.interactions.id, interactionId));

				// Trigger battle card generation every 2 processed calls
				if (companyId) {
					try {
						const processedCount = await db
							.select({ count: schema.interactions.id })
							.from(schema.interactions)
							.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
							.where(and(eq(schema.salespeople.companyId, companyId), eq(schema.interactions.processedStatus, "processed")));

						const totalProcessed = processedCount.length;
						if (totalProcessed > 0 && totalProcessed % 2 === 0) {
							logger.info({ companyId, totalProcessed }, "Triggering battle card generation (every 2 calls)");
							// Run in background - don't block the main processing
							autoGenerateBattleCardsForCompany(companyId).catch((error) => {
								logger.error({ companyId, error }, "Failed to auto-generate battle cards");
							});
						}
					} catch (error) {
						logger.error({ companyId, error }, "Failed to check for battle card generation trigger");
					}
				}
			}

			logger.info(
				{ interactionId },
				"Completed branched analysis with integrated roleplay (4 API calls: rating → flagging → [extraction, persona+roleplay])",
			);
		} catch (error) {
			await db.update(schema.interactions).set({ processedStatus: "failed" }).where(eq(schema.interactions.id, interactionId));
			logger.error({ interactionId, error }, "Failed to process interaction with branched workflow");
		}
	}
}
