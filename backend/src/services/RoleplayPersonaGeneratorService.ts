/**
 * RoleplayPersonaGeneratorService - AI persona generation for ElevenLabs training
 *
 * This service generates psychologically-grounded prospect personas for two training modes:
 *
 * 1. FLAG-BASED TRAINING (from call analysis):
 *    - Method: generateFromFlag()
 *    - Input: Flag data from analyzed calls (specific mistakes/moments to practice)
 *    - Use case: Rep made a mistake on a call, needs to practice that exact scenario
 *
 * 2. SCENARIO-BASED TRAINING (skills + battle cards):
 *    - Method: generatePersonaForScenario()
 *    - Input: Training scenario + company context
 *    - Use case: Proactive practice from skill gaps OR battle card situations
 *    - Both skill training and battle card training use this same flow
 *
 * Both methods output ElevenLabs-compatible persona prompts with system prompts,
 * first messages, and voice characteristics.
 */

import { getPrompt } from "#/vantage/slopAsker";
import { logger } from "#/lib/logger";
import { getAnthropicClient, ANTHROPIC_MODEL, isAnthropicAvailable } from "#/lib/anthropic";
import { AI } from "#/config";
import type Anthropic from "@anthropic-ai/sdk";
import type { TranscriptionResult } from "#/services/AudioTranscriptionService";
import { CompanyAIContextService } from "./CompanyAIContextService";

/**
 * Flag data for roleplay generation
 */
export interface FlagDataInput {
	/** Flag title/reason */
	reason?: string;
	/** Detailed flag data from AI analysis */
	flagData?: {
		flag_title?: string;
		what_happened?: string;
		prospect_quote?: string;
		rep_quote?: string;
		what_went_wrong?: string;
		better_response?: string;
		timestamps?: {
			start?: string;
			end?: string;
		};
	};
}

/**
 * Input for generating a roleplay persona from flag
 * ARCHITECTURE: persona (from analysis) + flag + company brain → Claude → ElevenLabs systemPrompt + firstMessage
 * If persona is provided, uses it directly. Otherwise falls back to transcript + flag approach.
 */
export interface RoleplayFromFlagInput {
	/** Full transcript from the sales call */
	transcript: TranscriptionResult | null;
	/** Flag data with coaching information */
	flag: FlagDataInput;
	/** Salesperson name for context */
	salespersonName?: string;
	/** Company ID for loading Company Brain context */
	companyId?: number;
	/** Pre-extracted psychological persona from call analysis (step 4) - if provided, uses this instead of re-extracting from transcript */
	persona?: {
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
	} | null;
}

/**
 * Legacy input for generating a roleplay persona (kept for backward compatibility)
 */
export interface RoleplayPersonaInput {
	/** Full transcript context from the sales call */
	transcriptContext: string;
	/** Pre-extracted persona profile (if available) - accepts the JSONB structure from database */
	personaProfile?: Record<string, unknown> | null;
	/** Call metadata (prospect info, call context, etc.) */
	callMetadata?: {
		prospect?: {
			name?: string;
			company?: string;
			title?: string;
			industry?: string;
		};
		context?: {
			callType?: string;
			callDuration?: string;
		};
		communication?: {
			tone?: string;
			concerns?: string[];
			openingLine?: string;
		};
	} | null;
	/** Training focus - what skill or moment is being practiced */
	trainingFocus?: string;
}

/**
 * Metadata extracted from the persona generation
 * Stored separately in the database for UI display
 */
export interface PersonaMetadata {
	/** Prospect basic info */
	prospect: {
		name: string;
		role: string;
		company: string;
		industry: string;
	};
	/** Flag moment details */
	flagMoment?: {
		issueType: string;
		whatCustomerSaid: string;
		whatWentWrong: string;
	};
	/** Voice/speaking characteristics */
	voiceCharacteristics?: {
		tone?: string;
		pace?: string;
		energy?: string;
		fillerWords?: string[];
	};
}

/**
 * Result of roleplay persona generation
 */
export interface RoleplayPersonaResult {
	/** System prompt for ElevenLabs agent */
	systemPrompt: string;
	/** First message the prospect should say */
	firstMessage: string;
	/** Extracted metadata for storage/display */
	metadata: PersonaMetadata;
	/** Voice characteristics suggestions (deprecated - use metadata.voiceCharacteristics) */
	voiceCharacteristics?: {
		tone?: string;
		pace?: string;
		energy?: string;
	};
}

/**
 * Service for generating psychologically-grounded roleplay personas
 * from transcript context for ElevenLabs training sessions.
 *
 * NEW SIMPLIFIED ARCHITECTURE:
 * - Single API call: transcript + flag → Claude → persona + metadata
 * - Persona goes directly to ElevenLabs
 * - Metadata is stored separately for UI display
 */
export class RoleplayPersonaGeneratorService {
	private get anthropic(): Anthropic {
		return getAnthropicClient();
	}

	/**
	 * Generate roleplay persona from flag + persona (or transcript as fallback)
	 * Uses pre-extracted persona from analysis when available, eliminating redundant extraction.
	 */
	async generateFromFlag(input: RoleplayFromFlagInput): Promise<RoleplayPersonaResult> {
		logger.info(
			{
				hasTranscript: !!input.transcript,
				hasPersona: !!input.persona,
				flagReason: input.flag.reason,
				hasFlagData: !!input.flag.flagData,
				companyId: input.companyId,
			},
			"Generating roleplay persona from flag",
		);

		// Serialize transcript (used for context even when persona is provided)
		const transcriptContext = serializeTranscriptForRoleplay(input.transcript);

		// Build flag data string
		const flagDataStr = this.buildFlagDataString(input.flag);

		// Build persona context string if persona data is provided
		const personaContextStr = input.persona ? this.buildPersonaContextString(input.persona) : null;

		// Load Company Brain context if companyId provided
		let companyContextStr = "No company context available";
		if (input.companyId) {
			try {
				const companyContext = await CompanyAIContextService.loadCompanyContext(input.companyId);
				companyContextStr = CompanyAIContextService.formatContextForPrompt(companyContext);
				logger.debug({ companyId: input.companyId }, "Loaded Company Brain context for roleplay persona generation");
			} catch (error) {
				logger.warn({ error, companyId: input.companyId }, "Failed to load company context for roleplay - continuing without it");
			}
		}

		// Get the meta-prompt template
		const metaPrompt = await getPrompt("training_roleplay");

		// Replace placeholders - use persona context if available, otherwise transcript
		let fullPrompt = metaPrompt;
		fullPrompt = fullPrompt.replace("{{COMPANY_CONTEXT}}", companyContextStr);

		// If we have pre-extracted persona, include it prominently and use transcript as supplementary context
		if (personaContextStr) {
			fullPrompt = fullPrompt.replace(
				"{{TRANSCRIPT_CONTEXT}}",
				`## PRE-EXTRACTED PSYCHOLOGICAL PERSONA (from call analysis):\n${personaContextStr}\n\n## ORIGINAL TRANSCRIPT (for verbatim quotes and context):\n${transcriptContext || "No transcript available"}`,
			);
			logger.info("Using pre-extracted persona data for roleplay generation");
		} else {
			fullPrompt = fullPrompt.replace("{{TRANSCRIPT_CONTEXT}}", transcriptContext || "No transcript available");
		}
		fullPrompt = fullPrompt.replace("{{FLAG_DATA}}", flagDataStr);

		// Call Claude to generate the persona
		const response = await this.anthropic.messages.create({
			model: ANTHROPIC_MODEL,
			max_tokens: AI.MAX_TOKENS.ROLEPLAY_PERSONA,
			messages: [
				{
					role: "user",
					content: fullPrompt,
				},
			],
		});

		// Check if response was cut off due to token limit
		if (response.stop_reason === "max_tokens") {
			logger.warn(
				{
					outputTokens: response.usage?.output_tokens,
					stopReason: response.stop_reason,
				},
				"Roleplay persona generation hit max_tokens limit - output may be truncated",
			);
		}

		logger.debug(
			{
				stopReason: response.stop_reason,
				inputTokens: response.usage?.input_tokens,
				outputTokens: response.usage?.output_tokens,
			},
			"Claude response stats for roleplay persona",
		);

		// Extract the generated persona prompt and metadata from the response
		const result = this.parseResponse(response, input.flag);

		logger.info(
			{
				hasSystemPrompt: !!result.systemPrompt,
				hasFirstMessage: !!result.firstMessage,
				systemPromptLength: result.systemPrompt?.length ?? 0,
				prospectName: result.metadata?.prospect?.name,
			},
			"Generated roleplay persona from flag",
		);

		return result;
	}

	/**
	 * Build a formatted string from flag data for the prompt
	 */
	private buildFlagDataString(flag: FlagDataInput): string {
		const parts: string[] = [];

		if (flag.reason) {
			parts.push(`**Flag Reason:** ${flag.reason}`);
		}

		if (flag.flagData) {
			const fd = flag.flagData;
			if (fd.flag_title) parts.push(`**Title:** ${fd.flag_title}`);
			if (fd.what_happened) parts.push(`**What Happened:** ${fd.what_happened}`);
			if (fd.prospect_quote) parts.push(`**Prospect Quote:** "${fd.prospect_quote}"`);
			if (fd.rep_quote) parts.push(`**Rep Quote:** "${fd.rep_quote}"`);
			if (fd.what_went_wrong) parts.push(`**What Went Wrong:** ${fd.what_went_wrong}`);
			if (fd.better_response) parts.push(`**Better Response:** ${fd.better_response}`);
			if (fd.timestamps) {
				parts.push(`**Timestamp:** ${fd.timestamps.start ?? "?"} - ${fd.timestamps.end ?? "?"}`);
			}
		}

		return parts.length > 0 ? parts.join("\n") : "No flag data available";
	}

	/**
	 * Build a formatted string from persona data for the prompt
	 * This includes all the psychological profile fields extracted during analysis
	 */
	private buildPersonaContextString(persona: NonNullable<RoleplayFromFlagInput["persona"]>): string {
		const sections: string[] = [];

		// Basic Identity
		if (persona.name || persona.role || persona.company || persona.industry) {
			sections.push(`### IDENTITY
- **Name:** ${persona.name ?? "Unknown"}
- **Role:** ${persona.role ?? "Unknown"}
- **Company:** ${persona.company ?? "Unknown"}
- **Industry:** ${persona.industry ?? "Unknown"}`);
		}

		// Core Psychology
		if (persona.core_identity || persona.how_they_process_information) {
			sections.push(`### CORE PSYCHOLOGY
${persona.core_identity ? `**Core Identity:** ${persona.core_identity}` : ""}
${persona.how_they_process_information ? `**How They Process Information:** ${persona.how_they_process_information}` : ""}`);
		}

		// Communication Style
		if (persona.speaking_style || persona.filler_words?.length) {
			sections.push(`### COMMUNICATION STYLE
${persona.speaking_style ? `**Speaking Style:** ${persona.speaking_style}` : ""}
${persona.filler_words?.length ? `**Filler Words:** ${persona.filler_words.join(", ")}` : ""}`);
		}

		// Psychological State
		if (persona.psychological_state || persona.feeling_beneath_surface) {
			sections.push(`### PSYCHOLOGICAL STATE
${persona.psychological_state ? `**Current State:** ${persona.psychological_state}` : ""}
${persona.feeling_beneath_surface ? `**Beneath the Surface:** ${persona.feeling_beneath_surface}` : ""}`);
		}

		// Beliefs About Salespeople
		if (persona.what_learned_about_salespeople || persona.what_earns_respect || persona.what_triggers_shutdown) {
			sections.push(`### BELIEFS ABOUT SALESPEOPLE
${persona.what_learned_about_salespeople ? `**What They've Learned:** ${persona.what_learned_about_salespeople}` : ""}
${persona.what_earns_respect ? `**What Earns Respect:** ${persona.what_earns_respect}` : ""}
${persona.what_triggers_shutdown ? `**What Triggers Shutdown:** ${persona.what_triggers_shutdown}` : ""}`);
		}

		// Internal Voice
		if (persona.internal_narrator || persona.bullshit_detector || persona.engagement_thermostat) {
			sections.push(`### INTERNAL VOICE
${persona.internal_narrator ? `**Internal Narrator:** ${persona.internal_narrator}` : ""}
${persona.bullshit_detector ? `**Bullshit Detector:** ${persona.bullshit_detector}` : ""}
${persona.engagement_thermostat ? `**Engagement Thermostat:** ${persona.engagement_thermostat}` : ""}`);
		}

		// Knowledge Base
		if (persona.knowledge_not_shared || persona.mental_model_of_problem) {
			sections.push(`### KNOWLEDGE BASE
${persona.knowledge_not_shared ? `**Knowledge Not Shared:** ${persona.knowledge_not_shared}` : ""}
${persona.mental_model_of_problem ? `**Mental Model of Problem:** ${persona.mental_model_of_problem}` : ""}`);
		}

		// Resolution
		if (persona.resolution_positive || persona.resolution_negative) {
			sections.push(`### RESOLUTION SIGNALS
${persona.resolution_positive ? `**Positive Resolution:** ${persona.resolution_positive}` : ""}
${persona.resolution_negative ? `**Negative Resolution:** ${persona.resolution_negative}` : ""}`);
		}

		return sections.join("\n\n");
	}

	/**
	 * Generate a roleplay persona for scenario-based training (skills + battle cards).
	 * Used for proactive practice from:
	 * - Skill gaps (objection handling, discovery, closing, etc.)
	 * - Battle card situations (specific objections, pain points)
	 *
	 * For flag-based training (practicing specific call mistakes), use generateFromFlag() instead.
	 */
	async generatePersonaForScenario(input: RoleplayPersonaInput): Promise<RoleplayPersonaResult> {
		logger.info(
			{
				hasTranscript: !!input.transcriptContext,
				hasPersona: !!input.personaProfile,
				hasMetadata: !!input.callMetadata,
				trainingFocus: input.trainingFocus,
			},
			"Generating roleplay persona for skill training",
		);

		// Get the meta-prompt template
		const metaPrompt = await getPrompt("training_roleplay");

		// Build the full prompt with input data
		const fullPrompt = this.buildPromptWithContext(metaPrompt, input);

		// Call Claude to generate the persona
		const response = await this.anthropic.messages.create({
			model: ANTHROPIC_MODEL,
			max_tokens: AI.MAX_TOKENS.ROLEPLAY_FULL,
			messages: [
				{
					role: "user",
					content: fullPrompt,
				},
			],
		});

		// Extract the generated persona prompt from the response
		const result = this.parseResponse(response);

		logger.info(
			{
				hasSystemPrompt: !!result.systemPrompt,
				hasFirstMessage: !!result.firstMessage,
				systemPromptLength: result.systemPrompt?.length ?? 0,
			},
			"Generated roleplay persona",
		);

		return result;
	}

	/**
	 * Build the full prompt with all context data (legacy)
	 */
	private buildPromptWithContext(metaPrompt: string, input: RoleplayPersonaInput): string {
		let prompt = metaPrompt;

		// Replace transcript context
		prompt = prompt.replace("{{TRANSCRIPT_CONTEXT}}", input.transcriptContext || "No transcript available");

		// Replace flag data with training focus for legacy compatibility
		const trainingFocusStr = input.trainingFocus ?? "General sales skills practice";
		prompt = prompt.replace("{{FLAG_DATA}}", `Training Focus: ${trainingFocusStr}`);

		return prompt;
	}

	/**
	 * Parse the Claude response to extract the persona prompt, first message, and metadata
	 */
	private parseResponse(response: Anthropic.Message, flag?: FlagDataInput): RoleplayPersonaResult {
		// Get the text content from the response
		const textContent = response.content.find((block) => block.type === "text");
		if (!textContent || textContent.type !== "text") {
			throw new Error("No text content in Claude response");
		}

		const fullText = textContent.text;

		// Extract the system prompt between ---BEGIN PERSONA PROMPT--- and ---END PERSONA PROMPT---
		const beginMarker = "---BEGIN PERSONA PROMPT---";
		const endMarker = "---END PERSONA PROMPT---";

		const beginIndex = fullText.indexOf(beginMarker);
		const endIndex = fullText.indexOf(endMarker);

		let systemPrompt: string;
		let remainingText: string;

		if (beginIndex !== -1 && endIndex !== -1) {
			systemPrompt = fullText.slice(beginIndex + beginMarker.length, endIndex).trim();
			remainingText = fullText.slice(endIndex + endMarker.length);
		} else {
			// Fallback: use the entire response as the system prompt
			logger.warn("Could not find persona prompt markers in Claude response, using full text");
			systemPrompt = fullText;
			remainingText = "";
		}

		// Extract the opening line (first message)
		// Try multiple patterns to handle various quote styles and multi-line content
		let firstMessage: string | null = null;

		// Pattern 1: **Opening Line:** with curly quotes (multi-line capable)
		const openingLineCurlyMatch = remainingText.match(/\*\*Opening Line\*\*[:\s]*[""]([^""]+)[""]/is);
		if (openingLineCurlyMatch) {
			firstMessage = openingLineCurlyMatch[1].trim();
		}

		// Pattern 2: **Opening Line:** with straight quotes (multi-line capable)
		if (!firstMessage) {
			const openingLineStraightMatch = remainingText.match(/\*\*Opening Line\*\*[:\s]*"([\s\S]*?)"/i);
			if (openingLineStraightMatch) {
				firstMessage = openingLineStraightMatch[1].trim();
			}
		}

		// Pattern 3: Opening Line: without bold markers
		if (!firstMessage) {
			const openingLineSimpleMatch = remainingText.match(/(?:Opening Line|OPENING LINE)[:\s]*[""]?([\s\S]*?)[""]?\s*(?:\*\*|$)/i);
			if (openingLineSimpleMatch && openingLineSimpleMatch[1].trim().length > 10) {
				firstMessage = openingLineSimpleMatch[1].trim();
			}
		}

		// Pattern 4: Fallback to extracting from system prompt
		if (!firstMessage) {
			firstMessage = this.extractFirstMessageFromPrompt(systemPrompt);
		}

		// Pattern 5: Ultimate fallback - use the flag's prospect quote directly
		if ((!firstMessage || firstMessage === "Hello, I'm calling about the solution you mentioned.") && flag?.flagData?.prospect_quote) {
			logger.info("Using flag's prospect_quote as first message fallback");
			firstMessage = flag.flagData.prospect_quote;
		}

		// Log what we extracted for debugging
		logger.debug(
			{
				firstMessageLength: firstMessage?.length ?? 0,
				firstMessagePreview: firstMessage?.slice(0, 100),
				hasRemainingText: remainingText.length > 0,
			},
			"Extracted first message from roleplay response",
		);

		// Extract voice characteristics
		const voiceMatch = remainingText.match(/(?:Voice Characteristics|VOICE CHARACTERISTICS)[:\s]*([^\n]+(?:\n(?![A-Z])[^\n]+)*)/i);
		let voiceCharacteristics: RoleplayPersonaResult["voiceCharacteristics"];

		if (voiceMatch) {
			const voiceText = voiceMatch[1].toLowerCase();
			voiceCharacteristics = {
				tone: voiceText.includes("warm")
					? "warm"
					: voiceText.includes("skeptical")
						? "skeptical"
						: voiceText.includes("professional")
							? "professional"
							: "neutral",
				pace: voiceText.includes("fast") ? "fast" : voiceText.includes("slow") ? "slow" : "moderate",
				energy: voiceText.includes("high") ? "high" : voiceText.includes("low") ? "low" : "medium",
			};
		}

		// Extract metadata from the system prompt
		const metadata = this.extractMetadata(systemPrompt, flag, voiceCharacteristics);

		return {
			systemPrompt,
			firstMessage,
			metadata,
			voiceCharacteristics,
		};
	}

	/**
	 * Extract the first message from the system prompt if not found in remaining text
	 */
	private extractFirstMessageFromPrompt(systemPrompt: string): string {
		// Pattern 1: Look for the BEGIN THE ROLEPLAY section with multi-line quote support
		// The prompt template shows: Your first message to start the roleplay:\n"[...]"
		const beginRoleplaySection = systemPrompt.match(/BEGIN THE ROLEPLAY[\s\S]*$/i);
		if (beginRoleplaySection) {
			const section = beginRoleplaySection[0];

			// Try to find quoted text after "Your first message" - straight quotes, multi-line
			const straightQuoteMatch = section.match(/Your first message[^"]*"([\s\S]*?)"/i);
			if (straightQuoteMatch && straightQuoteMatch[1].trim().length > 5) {
				return straightQuoteMatch[1].trim();
			}

			// Try curly quotes
			const curlyQuoteMatch = section.match(/Your first message[^""]*"([\s\S]*?)"/i);
			if (curlyQuoteMatch && curlyQuoteMatch[1].trim().length > 5) {
				return curlyQuoteMatch[1].trim();
			}

			// Try to find any substantial quoted text in the section
			const anyQuoteMatch = section.match(/"([\s\S]{20,}?)"/);
			if (anyQuoteMatch) {
				return anyQuoteMatch[1].trim();
			}
		}

		// Pattern 2: Look for "Your first message" pattern anywhere in the prompt
		const firstMsgMatchStraight = systemPrompt.match(/Your first message[:\s]*"([\s\S]*?)"/i);
		if (firstMsgMatchStraight && firstMsgMatchStraight[1].trim().length > 5) {
			return firstMsgMatchStraight[1].trim();
		}

		const firstMsgMatchCurly = systemPrompt.match(/Your first message[:\s]*"([\s\S]*?)"/i);
		if (firstMsgMatchCurly && firstMsgMatchCurly[1].trim().length > 5) {
			return firstMsgMatchCurly[1].trim();
		}

		// Pattern 3: Look for prospect quote from flag data embedded in the prompt
		// The prompt often includes the prospect's quote which should be the first message
		const prospectQuoteMatch = systemPrompt.match(/You (?:just )?said[:\s]*[""]?([\s\S]{10,}?)[""]?\s*(?:Then|Now|This)/i);
		if (prospectQuoteMatch) {
			return prospectQuoteMatch[1].trim();
		}

		// Pattern 4: Fallback - use the flag's prospect quote if available
		// This is handled in the caller by using flag data

		logger.warn("Could not extract first message from system prompt, using fallback");
		return "Hello, I'm calling about the solution you mentioned.";
	}

	/**
	 * Extract metadata from the generated persona prompt
	 */
	private extractMetadata(
		systemPrompt: string,
		flag?: FlagDataInput,
		voiceCharacteristics?: RoleplayPersonaResult["voiceCharacteristics"],
	): PersonaMetadata {
		// Extract prospect info from the header line "You are [NAME], a [ROLE] at [COMPANY]"
		const headerMatch = systemPrompt.match(/You are ([^,]+),\s*(?:a\s+)?([^at]+?)\s+at\s+([^.\n]+)/i);

		let name = "Unknown Prospect";
		let role = "Business Professional";
		let company = "Unknown Company";

		if (headerMatch) {
			name = headerMatch[1].trim();
			role = headerMatch[2].trim();
			company = headerMatch[3].trim();
		}

		// Try to extract industry from the prompt
		const industryMatch = systemPrompt.match(/Industry[:\s]+([^\n]+)/i);
		const industry = industryMatch ? industryMatch[1].trim() : "General Business";

		// Extract filler words if mentioned
		const fillerMatch = systemPrompt.match(/(?:filler words|You use these words)[:\s]*([^\n]+)/i);
		const fillerWords = fillerMatch
			? fillerMatch[1]
					.split(/[,;]/)
					.map((w) => w.trim().replace(/["']/g, ""))
					.filter((w) => w.length > 0)
			: undefined;

		// Build metadata
		const metadata: PersonaMetadata = {
			prospect: {
				name,
				role,
				company,
				industry,
			},
		};

		// Add flag moment details if available
		if (flag?.flagData) {
			metadata.flagMoment = {
				issueType: flag.reason ?? flag.flagData.flag_title ?? "Unknown",
				whatCustomerSaid: flag.flagData.prospect_quote ?? "",
				whatWentWrong: flag.flagData.what_went_wrong ?? "",
			};
		}

		// Add voice characteristics
		if (voiceCharacteristics ?? fillerWords) {
			metadata.voiceCharacteristics = {
				...voiceCharacteristics,
				fillerWords,
			};
		}

		return metadata;
	}
}

// Singleton instance
let roleplayPersonaGeneratorService: RoleplayPersonaGeneratorService | null = null;

/**
 * Get the singleton instance of RoleplayPersonaGeneratorService
 */
export function getRoleplayPersonaGeneratorService(): RoleplayPersonaGeneratorService | null {
	if (!roleplayPersonaGeneratorService && isAnthropicAvailable()) {
		roleplayPersonaGeneratorService = new RoleplayPersonaGeneratorService();
	}
	return roleplayPersonaGeneratorService;
}

/**
 * Helper function to serialize transcript segments for the roleplay context
 */
export function serializeTranscriptForRoleplay(transcript: TranscriptionResult | null | undefined): string {
	if (!transcript?.segments || !Array.isArray(transcript.segments)) {
		return "";
	}

	return transcript.segments
		.map((segment) => {
			const speaker = segment.speakerId ?? "Unknown";
			const text = segment.text?.replace(/\s+/g, " ").trim() ?? "";
			return `${speaker}: ${text}`;
		})
		.join("\n");
}
