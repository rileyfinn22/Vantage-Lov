/**
 * CachedAnalysisService - Uses Anthropic's prompt caching to analyze transcripts efficiently
 *
 * The transcript is cached in the system message, and each analysis type (rating, flagging, etc.)
 * sends only its specific prompt in the user message. This way:
 * - First call pays full price for transcript (cache write)
 * - Subsequent calls pay 10% for transcript (cache hit)
 *
 * With 4 analysis calls per transcript, this saves ~50-60% on input tokens.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logger } from "#/lib/logger";
import { AI } from "#/config";
import { ExtractionResponseSchema, type ExtractionResponse } from "./CallExtractionService";

// Response schemas
export const RatingWithSkillsResponse = z.object({
	overall_rating: z.number().int().min(1).max(100),
	call_context: z.object({
		inferred_call_type: z
			.string()
			.transform((v) => v.toLowerCase().trim() as "discovery" | "demo" | "negotiation" | "closing" | "follow-up"),
		call_stage: z.string().transform((v) => v.toLowerCase().trim() as "early" | "mid" | "late"),
		primary_objective: z.string(),
	}),
	skills: z.object({
		objection_handling: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]),
			evidence: z.string(),
			missed_opportunity: z.string().nullable(),
		}),
		pricing_discussions: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]),
			evidence: z.string(),
			missed_opportunity: z.string().nullable(),
		}),
		discovery_needs_analysis: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]),
			evidence: z.string(),
			missed_opportunity: z.string().nullable(),
		}),
		closing_next_steps: z.object({
			score: z.union([z.number().int().min(1).max(10), z.literal("N/A")]),
			evidence: z.string(),
			missed_opportunity: z.string().nullable(),
		}),
	}),
	red_flags: z.array(z.string()),
	rep_summary: z.string(),
	top_strength: z.string(),
	priority_improvement: z.string(),
});

export const FlagResponse = z.object({
	revision: z.literal("v1"),
	flag_title: z.string(),
	confidenceOutOf100: z.number().int().min(0).max(100),
	validation_checklist: z.array(z.string()),
	what_happened: z.string(),
	prospect_said: z.string().optional(),
	rep_said: z.string().optional(),
	revenue_impact: z.string(),
	better_response: z.union([z.string(), z.array(z.string())]),
	benchmarking_context: z.string(),
	pattern_analysis: z.string().optional(),
	role_expectation: z.string(),
	why_this_matters: z.string(),
	timestamps: z.object({
		start: z.string().optional(),
		end: z.string().optional(),
	}),
});

export const FlaggingResponse = z.object({
	flags: z.array(FlagResponse),
});

export type CachedAnalysisConfig = {
	apiKey: string;
	model?: string;
};

export class CachedAnalysisService {
	private client: Anthropic;
	private model: string;

	constructor(config: CachedAnalysisConfig) {
		this.client = new Anthropic({ apiKey: config.apiKey });
		this.model = config.model ?? "claude-sonnet-4-20250514";
	}

	private async runAnalysis(
		cachedSystem: Anthropic.Messages.TextBlockParam,
		userPrompt: string,
		interactionId?: string,
		modelOverride?: string,
		maxTokensOverride?: number,
	): Promise<string> {
		const response = await this.client.messages.create({
			model: modelOverride ?? this.model,
			max_tokens: maxTokensOverride ?? AI.MAX_TOKENS.DEFAULT,
			temperature: 0.1, // Low temperature for consistent, deterministic scoring
			system: [cachedSystem],
			messages: [
				{
					role: "user",
					content: userPrompt,
				},
			],
		});

		// Log cache performance
		const usage = response.usage as {
			input_tokens: number;
			output_tokens: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		};

		logger.info(
			{
				interactionId,
				model: modelOverride ?? this.model,
				stopReason: response.stop_reason,
				inputTokens: usage.input_tokens,
				outputTokens: usage.output_tokens,
				cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
				cacheReadTokens: usage.cache_read_input_tokens ?? 0,
			},
			"API call completed",
		);

		if (response.stop_reason === "max_tokens") {
			logger.warn(
				{ interactionId, outputTokens: usage.output_tokens, maxTokens: maxTokensOverride ?? AI.MAX_TOKENS.DEFAULT },
				"Response hit max_tokens — output is truncated and JSON will likely fail to parse",
			);
		}

		// Extract text from response
		const textBlock = response.content.find((block) => block.type === "text");
		if (!textBlock || textBlock.type !== "text") {
			throw new Error("No text response from API");
		}

		// Try to extract JSON from the response
		let text = textBlock.text;

		// If response contains markdown code blocks, extract the JSON
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch) {
			text = jsonMatch[1].trim();
		}

		return text;
	}

	private buildRatingPrompt(basePrompt: string, companyContext?: string): string {
		let prompt = basePrompt;
		if (companyContext) {
			prompt = prompt.replace("{{COMPANY_CONTEXT}}", companyContext);
		} else {
			prompt = prompt.replace("{{COMPANY_CONTEXT}}", "");
		}
		// Remove transcript placeholder since it's in the system message
		prompt = prompt.replace("{{CALL_TRANSCRIPT}}", "[See transcript in system message above]");

		return `Analyze the transcript above and provide a rating assessment.

${prompt}

IMPORTANT: Respond with ONLY valid JSON matching this structure:
{
  "overall_rating": <number 1-100>,
  "call_context": {
    "inferred_call_type": "<string>",
    "call_stage": "<string>",
    "primary_objective": "<string>"
  },
  "skills": {
    "objection_handling": { "score": <number 1-10 or "N/A">, "evidence": "<string>", "missed_opportunity": "<string or null>" },
    "pricing_discussions": { "score": <number 1-10 or "N/A">, "evidence": "<string>", "missed_opportunity": "<string or null>" },
    "discovery_needs_analysis": { "score": <number 1-10 or "N/A">, "evidence": "<string>", "missed_opportunity": "<string or null>" },
    "closing_next_steps": { "score": <number 1-10 or "N/A">, "evidence": "<string>", "missed_opportunity": "<string or null>" }
  },
  "red_flags": ["<string>", ...],
  "rep_summary": "<string>",
  "top_strength": "<string>",
  "priority_improvement": "<string>"
}`;
	}

	private buildFlaggingPrompt(basePrompt: string, companyContext?: string): string {
		let prompt = basePrompt;
		if (companyContext) {
			prompt = prompt.replace("{{COMPANY_CONTEXT}}", companyContext);
		} else {
			prompt = prompt.replace("{{COMPANY_CONTEXT}}", "");
		}
		// Remove transcript placeholder since it's in the system message
		prompt = prompt.replace("{{CALL_TRANSCRIPT}}", "[See transcript in system message above]");

		return `Analyze the transcript above and identify coaching flags.

${prompt}

IMPORTANT: Respond with ONLY valid JSON. Be concise — every text field should be 1-2 sentences max. Do NOT include a scratchpad or any reasoning outside the flags array.

{
  "flags": [
    {
      "revision": "v1",
      "flag_title": "<string>",
      "confidenceOutOf100": <number>,
      "validation_checklist": ["<short phrase>", ...],
      "what_happened": "<1-2 sentences>",
      "prospect_said": "<1-2 sentences of the key prospect quote>",
      "rep_said": "<1-2 sentences of what the rep said>",
      "revenue_impact": "<1 sentence>",
      "better_response": ["<response1>", "<response2>"],
      "benchmarking_context": "<1 sentence>",
      "pattern_analysis": "<1 sentence or null>",
      "role_expectation": "<1 sentence>",
      "why_this_matters": "<1 sentence>",
      "timestamps": { "start": "<HH:MM:SS>", "end": "<HH:MM:SS>" }
    }
  ]
}`;
	}

	private buildExtractionPrompt(basePrompt: string): string {
		let prompt = basePrompt;
		prompt = prompt.replace("{{CALL_TRANSCRIPT}}", "[See transcript in system message above]");
		prompt = prompt.replace("{{COMPANY_CONTEXT}}", "");

		return `Analyze the transcript above and extract objections, pain points, and potential battle cards.

${prompt}

IMPORTANT: Respond with ONLY valid JSON.`;
	}

	/**
	 * Branched workflow with integrated roleplay generation
	 * Rating (cache write) → Flagging (cache hit) → [Extraction, Persona+Roleplay] in parallel (cache hits)
	 *
	 * This eliminates separate per-flag API calls by having persona generate roleplay prompts for all flags.
	 */
	async analyzeTranscriptBranchedWithRoleplay(
		transcript: string,
		companyContext: string | undefined,
		prompts: {
			rating: string;
			flagging: string;
			extraction: string;
			persona: string;
		},
		interactionId?: string,
	): Promise<{
		rating?: z.infer<typeof RatingWithSkillsResponse>;
		flagging?: z.infer<typeof FlaggingResponse>;
		extraction?: ExtractionResponse;
		personaWithRoleplay?: PersonaWithRoleplayResult;
	}> {
		const results: {
			rating?: z.infer<typeof RatingWithSkillsResponse>;
			flagging?: z.infer<typeof FlaggingResponse>;
			extraction?: ExtractionResponse;
			personaWithRoleplay?: PersonaWithRoleplayResult;
		} = {};

		// Build the cached system message with transcript + company context
		const systemText = companyContext
			? `You are an expert sales performance analyst. Below is a sales call transcript that you will analyze.

## COMPANY CONTEXT (The Brain)

${companyContext}

## CALL TRANSCRIPT

${transcript}

---

You will receive specific analysis instructions in the user message. Respond with the requested analysis in valid JSON format.`
			: `You are an expert sales performance analyst. Below is a sales call transcript that you will analyze.

## CALL TRANSCRIPT

${transcript}

---

You will receive specific analysis instructions in the user message. Respond with the requested analysis in valid JSON format.`;

		const cachedSystemContent: Anthropic.Messages.TextBlockParam = {
			type: "text",
			text: systemText,
			cache_control: { type: "ephemeral" } as const,
		};

		// STEP 1: Rating runs FIRST (cache write)
		logger.info({ interactionId, step: "rating" }, "Starting rating analysis (cache write)");
		try {
			const ratingResult = await this.runAnalysis(cachedSystemContent, this.buildRatingPrompt(prompts.rating, undefined), interactionId);
			const parsed = JSON.parse(ratingResult);
			results.rating = RatingWithSkillsResponse.parse(parsed);
			logger.info({ interactionId, rating: results.rating.overall_rating }, "Completed rating analysis");
		} catch (error) {
			logger.error({ error, interactionId }, "Failed rating analysis");
			throw error;
		}

		// STEP 2: Run Flagging and Extraction in PARALLEL (both get cache hits)
		// Extraction doesn't need flags, so it can run in parallel with flagging
		logger.info({ interactionId }, "Starting parallel analysis (flagging, extraction) - cache hits");

		const [flaggingResult, extractionResult] = await Promise.allSettled([
			// Flagging - use higher token limit for detailed enterprise coaching
			(async () => {
				const result = await this.runAnalysis(
					cachedSystemContent,
					this.buildFlaggingPrompt(prompts.flagging, undefined),
					interactionId,
					undefined, // no model override
					AI.MAX_TOKENS.FLAGGING, // use higher token limit for detailed flags
				);

				// DEBUG: Log raw flagging response
				logger.info({ interactionId, rawResponseLength: result.length }, "Raw flagging response received");
				console.log("\n=== RAW FLAGGING RESPONSE ===\n", result.substring(0, 2000), "\n=== END PREVIEW ===\n");

				try {
					const parsed = JSON.parse(result);
					console.log("\n=== PARSED FLAGS COUNT ===", parsed.flags?.length ?? 0);
					return FlaggingResponse.parse(parsed);
				} catch (parseError) {
					console.error("\n=== JSON PARSE ERROR ===\n", parseError);
					console.log("\n=== FULL RAW RESPONSE ===\n", result);
					throw parseError;
				}
			})(),

			// Extraction (objections, pain points)
			(async () => {
				const result = await this.runAnalysis(cachedSystemContent, this.buildExtractionPrompt(prompts.extraction), interactionId);
				let text = result;
				const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
				if (jsonMatch) {
					text = jsonMatch[1].trim();
				}
				if (!text.startsWith("{")) {
					const firstBrace = text.indexOf("{");
					const lastBrace = text.lastIndexOf("}");
					if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
						text = text.substring(firstBrace, lastBrace + 1);
					}
				}
				const parsed = JSON.parse(text);
				return ExtractionResponseSchema.parse(parsed);
			})(),
		]);

		// Process flagging and extraction results
		if (flaggingResult.status === "fulfilled") {
			results.flagging = flaggingResult.value;
			logger.info({ interactionId, flagCount: results.flagging.flags.length }, "Completed flagging analysis");
		} else {
			logger.error({ error: flaggingResult.reason, interactionId }, "Failed flagging analysis");
		}

		if (extractionResult.status === "fulfilled") {
			results.extraction = extractionResult.value;
			logger.info(
				{
					interactionId,
					objections: results.extraction.objections.length,
					prospectPains: results.extraction.prospect_pain_points.length,
					repPains: results.extraction.rep_pain_points.length,
				},
				"Completed extraction analysis",
			);
		} else {
			logger.error({ error: extractionResult.reason, interactionId }, "Failed extraction analysis");
		}

		// STEP 3: Run Persona+Roleplay+Metadata+CallSummary AFTER flagging (needs flags for roleplay generation)
		logger.info({ interactionId }, "Starting persona+roleplay analysis (cache hit) - needs flags for roleplay");

		try {
			const personaResult = await this.runAnalysis(
				cachedSystemContent,
				this.buildPersonaWithRoleplayPrompt(prompts.persona, results.flagging?.flags ?? []),
				interactionId,
			);
			results.personaWithRoleplay = this.parsePersonaWithRoleplayResponse(personaResult);
			logger.info(
				{
					interactionId,
					personaName: results.personaWithRoleplay.persona.name,
					roleplayCount: results.personaWithRoleplay.flagRoleplays.length,
					hasCallSummary: !!results.personaWithRoleplay.callSummary,
				},
				"Completed persona+roleplay analysis",
			);
		} catch (error) {
			logger.error({ error, interactionId }, "Failed persona+roleplay analysis");
		}

		return results;
	}

	/**
	 * Build persona prompt that includes flags and requests roleplay prompts for each.
	 * The base prompt (from PERSONA_SYSTEM_INSTRUCTIONS) already contains the output schema.
	 * This function just injects the FLAGS section before the OUTPUT REQUIREMENTS section.
	 */
	private buildPersonaWithRoleplayPrompt(basePrompt: string, flags: z.infer<typeof FlagResponse>[]): string {
		let prompt = basePrompt;
		prompt = prompt.replace("{{CALL_TRANSCRIPT}}", "[See transcript in system message above]");

		// Build flag context section to inject before OUTPUT REQUIREMENTS
		let flagSection = "";
		if (flags.length > 0) {
			flagSection = `

## FLAGS TO GENERATE ROLEPLAY FOR

The following coaching flags were identified in this call. For EACH flag, you must generate an ElevenLabs-ready roleplay prompt.

${flags
	.map(
		(flag, i) => `### Flag ${i + 1}: ${flag.flag_title}
- **What Happened:** ${flag.what_happened}
- **Prospect Said:** ${flag.prospect_said ?? "N/A"}
- **Rep Said:** ${flag.rep_said ?? "N/A"}
- **Better Response:** ${Array.isArray(flag.better_response) ? flag.better_response.join(" OR ") : flag.better_response}
- **Timestamps:** ${flag.timestamps?.start ?? "?"} - ${flag.timestamps?.end ?? "?"}`,
	)
	.join("\n\n")}
`;
		}

		// Inject the flags section before the OUTPUT REQUIREMENTS section
		// The base prompt has "---\n\n## OUTPUT REQUIREMENTS" as a marker
		const marker = "---\n\n## OUTPUT REQUIREMENTS";
		if (prompt.includes(marker) && flagSection) {
			prompt = prompt.replace(marker, `${flagSection}\n${marker}`);
		} else if (flagSection) {
			// Fallback: append flags at the end if marker not found
			prompt = `${prompt}\n${flagSection}`;
		}

		return `Analyze the transcript above and extract the prospect's psychological profile AND generate roleplay training prompts.\n\n${prompt}`;
	}

	/**
	 * Parse the persona with roleplay response from Claude
	 */
	private parsePersonaWithRoleplayResponse(result: string): PersonaWithRoleplayResult {
		// Try to extract JSON from markdown code blocks
		let text = result;
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch) {
			text = jsonMatch[1].trim();
		}
		if (!text.startsWith("{")) {
			const firstBrace = text.indexOf("{");
			const lastBrace = text.lastIndexOf("}");
			if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
				text = text.substring(firstBrace, lastBrace + 1);
			}
		}

		const parsed = JSON.parse(text);

		// Extract persona
		const persona = parsed.persona ?? {};

		// Extract flag roleplays and convert to our format
		const flagRoleplays: FlagRoleplayPrompt[] = (parsed.flag_roleplays ?? []).map((rp: Record<string, unknown>) => ({
			flagTitle: rp.flag_title as string,
			systemPrompt: rp.system_prompt as string,
			firstMessage: rp.first_message as string,
			voiceId: (rp.voice_id as string) ?? AI.ROLEPLAY_DEFAULT_VOICE_ID,
			model: (rp.model as string) ?? AI.ROLEPLAY_DEFAULT_MODEL,
			metadata: {
				name: (rp.metadata as Record<string, string>)?.name ?? persona.name ?? "Unknown",
				role: (rp.metadata as Record<string, string>)?.role ?? persona.role ?? "Unknown",
				company: (rp.metadata as Record<string, string>)?.company ?? persona.company ?? "Unknown",
				industry: (rp.metadata as Record<string, string>)?.industry ?? persona.industry ?? "Unknown",
				skillPracticed: (rp.metadata as Record<string, string>)?.skill_practiced,
			},
		}));

		// Extract call summary
		const callSummary: CallSummary | undefined = parsed.call_summary
			? {
					overview: parsed.call_summary.overview,
					topics_discussed: parsed.call_summary.topics_discussed,
					outcome: parsed.call_summary.outcome,
					next_steps: parsed.call_summary.next_steps,
					key_moments: parsed.call_summary.key_moments,
				}
			: undefined;

		return {
			persona,
			flagRoleplays,
			callSummary,
		};
	}
}

/**
 * Roleplay prompt for ElevenLabs agent
 */
export interface FlagRoleplayPrompt {
	/** Flag title this roleplay is for */
	flagTitle: string;
	/** System prompt for ElevenLabs agent */
	systemPrompt: string;
	/** First message the prospect should say */
	firstMessage: string;
	/** ElevenLabs voice ID */
	voiceId: string;
	/** LLM model to use */
	model: string;
	/** Prospect metadata */
	metadata: {
		name: string;
		role: string;
		company: string;
		industry: string;
		skillPracticed?: string;
	};
}

/**
 * Call summary extracted during Phase 3 analysis
 */
export interface CallSummary {
	overview?: string;
	topics_discussed?: string[];
	outcome?: string;
	next_steps?: string[];
	key_moments?: string[];
}

/**
 * Extended persona result that includes roleplay prompts for each flag
 */
export interface PersonaWithRoleplayResult {
	/** Basic persona profile (simplified for practice-focused approach) */
	persona: {
		name?: string;
		company?: string;
		role?: string;
		industry?: string;
		speaking_style?: string;
		personality_notes?: string;
		business_concerns?: string;
		filler_words?: string[];
	};
	/** ElevenLabs-ready roleplay prompts for each flag */
	flagRoleplays: FlagRoleplayPrompt[];
	/** Call summary - narrative summary of what happened in the call */
	callSummary?: CallSummary;
}

// Singleton instance
let cachedAnalysisService: CachedAnalysisService | null = null;

export function getCachedAnalysisService(): CachedAnalysisService | null {
	if (!cachedAnalysisService && process.env.ANTHROPIC_API_KEY) {
		cachedAnalysisService = new CachedAnalysisService({
			apiKey: process.env.ANTHROPIC_API_KEY,
		});
	}
	return cachedAnalysisService;
}
