/**
 * Workbench Analysis Tools
 *
 * These tools make direct Anthropic API calls for transcript analysis.
 * Used by the Prompt Workbench for testing and iteration - no DB persistence.
 */

import type { ToolDefinition, ToolContext, JsonValue } from "#/agentic/types";
import { getAnthropicClient } from "#/lib/anthropic";
import { logger } from "#/lib/logger";
import { AI } from "#/config";
import {
	RATING_SYSTEM_INSTRUCTIONS,
	FLAGGING_SYSTEM_INSTRUCTIONS,
	EXTRACTION_SYSTEM_INSTRUCTIONS,
	PERSONA_SYSTEM_INSTRUCTIONS,
} from "#/lib/prompt/analysis-defaults";

const MODEL = "claude-sonnet-4-20250514";

/**
 * Run a single analysis call against Anthropic
 */
async function runAnalysisCall(params: {
	systemPrompt: string;
	userPrompt: string;
	maxTokens?: number;
}): Promise<string> {
	const anthropic = getAnthropicClient();

	const response = await anthropic.messages.create({
		model: MODEL,
		max_tokens: params.maxTokens ?? AI.MAX_TOKENS.DEFAULT,
		temperature: 0.1,
		system: params.systemPrompt,
		messages: [{ role: "user", content: params.userPrompt }],
	});

	const textBlock = response.content.find((block) => block.type === "text");
	if (!textBlock || textBlock.type !== "text") {
		throw new Error("No text response from API");
	}

	// Extract JSON from markdown code blocks if present
	let text = textBlock.text;
	const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		text = jsonMatch[1].trim();
	}

	return text;
}

/**
 * Build rating user prompt
 */
function buildRatingUserPrompt(transcript: string, companyContext?: string): string {
	let prompt = `Analyze the following sales call transcript and provide a comprehensive rating assessment.

## TRANSCRIPT

${transcript}

`;

	if (companyContext) {
		prompt += `## COMPANY CONTEXT

${companyContext}

`;
	}

	prompt += `IMPORTANT: Respond with ONLY valid JSON matching this structure:
{
  "overall_rating": <number 1-100>,
  "call_context": {
    "inferred_call_type": "<discovery|demo|negotiation|closing|follow-up>",
    "call_stage": "<early|mid|late>",
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

	return prompt;
}

/**
 * Build flagging user prompt
 */
function buildFlaggingUserPrompt(transcript: string, companyContext?: string): string {
	let prompt = `Analyze the following sales call transcript and identify coaching flags.

## TRANSCRIPT

${transcript}

`;

	if (companyContext) {
		prompt += `## COMPANY CONTEXT

${companyContext}

`;
	}

	prompt += `IMPORTANT: Respond with ONLY valid JSON. Be concise — every text field should be 1-2 sentences max.

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

	return prompt;
}

/**
 * Build extraction user prompt
 */
function buildExtractionUserPrompt(transcript: string): string {
	return `Analyze the following sales call transcript and extract objections, pain points, and coaching highlights.

## TRANSCRIPT

${transcript}

IMPORTANT: Respond with ONLY valid JSON matching this structure:
{
  "objections": [
    {
      "objection_text": "<exact quote>",
      "category": "<tech_stack|adoption|roi|timing|competition|status_quo|other>",
      "severity": <1-10>,
      "rep_response_quality": <1-10>,
      "rep_response": "<what rep said>",
      "better_response": "<suggested response>",
      "timestamp": "<HH:MM:SS>"
    }
  ],
  "prospect_pain_points": [
    {
      "pain_text": "<description>",
      "category": "<pipeline|rep_performance|coaching|revops|other>",
      "quantified": <boolean>,
      "quantification": "<numbers if mentioned>",
      "capitalized": <boolean>,
      "timestamp": "<HH:MM:SS>"
    }
  ],
  "rep_pain_points": [
    {
      "description": "<skill gap or issue>",
      "evidence": "<what happened>",
      "coaching_priority": <1-10>
    }
  ]
}`;
}

/**
 * Build persona user prompt with flags for roleplay generation
 */
function buildPersonaUserPrompt(transcript: string, flags: any[]): string {
	let prompt = `Analyze the following sales call transcript and extract the prospect's psychological profile AND generate roleplay training prompts.

## TRANSCRIPT

${transcript}

`;

	if (flags.length > 0) {
		prompt += `## FLAGS TO GENERATE ROLEPLAY FOR

${flags.map((flag, i) => `### Flag ${i + 1}: ${flag.flag_title}
- **What Happened:** ${flag.what_happened}
- **Prospect Said:** ${flag.prospect_said ?? "N/A"}
- **Rep Said:** ${flag.rep_said ?? "N/A"}
- **Better Response:** ${Array.isArray(flag.better_response) ? flag.better_response.join(" OR ") : flag.better_response}`).join("\n\n")}

`;
	}

	prompt += `IMPORTANT: Respond with ONLY valid JSON:
{
  "persona": {
    "name": "<string or null>",
    "company": "<string or null>",
    "role": "<string or null>",
    "industry": "<string or null>",
    "speaking_style": "<string>",
    "personality_notes": "<string>",
    "business_concerns": "<string>",
    "filler_words": ["<string>", ...]
  },
  "flag_roleplays": [
    {
      "flag_title": "<string>",
      "system_prompt": "<ElevenLabs-ready system prompt>",
      "first_message": "<what prospect says to start>",
      "voice_id": "pFZP5JQG7iQjIQuC4Bku",
      "model": "eleven_turbo_v2_5",
      "metadata": {
        "name": "<string>",
        "role": "<string>",
        "company": "<string>",
        "industry": "<string>",
        "skill_practiced": "<string>"
      }
    }
  ],
  "call_summary": {
    "overview": "<string>",
    "topics_discussed": ["<string>", ...],
    "outcome": "<string>",
    "next_steps": ["<string>", ...],
    "key_moments": ["<string>", ...]
  }
}`;

	return prompt;
}

export function getWorkbenchAnalysisTools(): ToolDefinition[] {
	return [
		{
			name: "analyze_rating",
			description: "Analyze transcript for rating, skills assessment, and red flags. Returns structured rating JSON.",
			inputSchema: {
				type: "object",
				properties: {
					transcript: { type: "string", description: "The call transcript to analyze" },
					companyContext: { type: "string", description: "Optional company context for calibration" },
					promptOverride: { type: "string", description: "Optional custom rating prompt to use instead of default" },
				},
				required: ["transcript"],
			},
			handler: async (args: unknown, _ctx: ToolContext): Promise<JsonValue> => {
				const input = args as { transcript: string; companyContext?: string; promptOverride?: string };

				logger.info({ transcriptLength: input.transcript.length }, "Running rating analysis");

				const systemPrompt = input.promptOverride ?? RATING_SYSTEM_INSTRUCTIONS;
				const userPrompt = buildRatingUserPrompt(input.transcript, input.companyContext);

				const result = await runAnalysisCall({ systemPrompt, userPrompt });
				return JSON.parse(result);
			},
		},
		{
			name: "analyze_flagging",
			description: "Analyze transcript for coaching flags with evidence and better responses. Returns structured flags JSON.",
			inputSchema: {
				type: "object",
				properties: {
					transcript: { type: "string", description: "The call transcript to analyze" },
					companyContext: { type: "string", description: "Optional company context for calibration" },
					promptOverride: { type: "string", description: "Optional custom flagging prompt to use instead of default" },
				},
				required: ["transcript"],
			},
			handler: async (args: unknown, _ctx: ToolContext): Promise<JsonValue> => {
				const input = args as { transcript: string; companyContext?: string; promptOverride?: string };

				logger.info({ transcriptLength: input.transcript.length }, "Running flagging analysis");

				const systemPrompt = input.promptOverride ?? FLAGGING_SYSTEM_INSTRUCTIONS;
				const userPrompt = buildFlaggingUserPrompt(input.transcript, input.companyContext);

				const result = await runAnalysisCall({
					systemPrompt,
					userPrompt,
					maxTokens: AI.MAX_TOKENS.FLAGGING,
				});
				return JSON.parse(result);
			},
		},
		{
			name: "analyze_extraction",
			description: "Extract objections, pain points, and rep skill gaps from transcript. Returns structured extraction JSON.",
			inputSchema: {
				type: "object",
				properties: {
					transcript: { type: "string", description: "The call transcript to analyze" },
					promptOverride: { type: "string", description: "Optional custom extraction prompt to use instead of default" },
				},
				required: ["transcript"],
			},
			handler: async (args: unknown, _ctx: ToolContext): Promise<JsonValue> => {
				const input = args as { transcript: string; promptOverride?: string };

				logger.info({ transcriptLength: input.transcript.length }, "Running extraction analysis");

				const systemPrompt = input.promptOverride ?? EXTRACTION_SYSTEM_INSTRUCTIONS;
				const userPrompt = buildExtractionUserPrompt(input.transcript);

				const result = await runAnalysisCall({ systemPrompt, userPrompt });
				return JSON.parse(result);
			},
		},
		{
			name: "analyze_persona",
			description: "Extract prospect persona and generate roleplay prompts for flags. Returns structured persona JSON.",
			inputSchema: {
				type: "object",
				properties: {
					transcript: { type: "string", description: "The call transcript to analyze" },
					flags: { type: "array", items: { type: "object" }, description: "Flags to generate roleplay prompts for" },
					promptOverride: { type: "string", description: "Optional custom persona prompt to use instead of default" },
				},
				required: ["transcript"],
			},
			handler: async (args: unknown, _ctx: ToolContext): Promise<JsonValue> => {
				const input = args as { transcript: string; flags?: any[]; promptOverride?: string };

				logger.info({ transcriptLength: input.transcript.length, flagCount: input.flags?.length ?? 0 }, "Running persona analysis");

				const systemPrompt = input.promptOverride ?? PERSONA_SYSTEM_INSTRUCTIONS;
				const userPrompt = buildPersonaUserPrompt(input.transcript, input.flags ?? []);

				const result = await runAnalysisCall({ systemPrompt, userPrompt });
				return JSON.parse(result);
			},
		},
	];
}
