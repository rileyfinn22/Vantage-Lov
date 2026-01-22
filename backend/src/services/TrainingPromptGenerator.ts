import type { flagDetailsData } from "#/vantage/training";
import type { TranscriptionResult } from "./AudioTranscriptionService";
import type { InteractionMetadata } from "#/data/types";
import { CompanyAIContextService } from "./CompanyAIContextService";

type FlagDetails = Awaited<ReturnType<typeof flagDetailsData>>;
type CompanyContext = Awaited<ReturnType<typeof CompanyAIContextService.loadCompanyContext>>;

interface PromptGenerationResult {
	systemPrompt: string;
	firstMessage: string;
}

/**
 * Generates ElevenLabs agent system instructions from Flag data
 * The prompt instructs the AI to roleplay as a prospect to help the rep practice
 */
export class TrainingPromptGenerator {
	/**
	 * Generate a system prompt and first message for ElevenLabs conversational AI
	 * @param flagDetails - Flag details including flag data, interaction, and salesperson info
	 * @param companyContext - Optional company-specific AI context learned from feedback
	 * @returns Object containing systemPrompt and firstMessage
	 */
	static generate(flagDetails: NonNullable<FlagDetails>, companyContext?: CompanyContext | null): PromptGenerationResult {
		const { flag, interaction, salesperson } = flagDetails;

		// Extract metadata if available
		const metadata = interaction?.metadata as InteractionMetadata | null | undefined;

		// Build prospect identity from metadata
		const prospectIdentity = TrainingPromptGenerator.buildProspectIdentity(metadata);

		// Extract key information from flag data
		const flagReason = flag.reason ?? "general sales skills";
		const flagData = flag.flagData;

		// Extract all available fields with fallbacks
		const flagTitle = flagData?.flag_title ?? "Sales Skills Practice";
		const whatHappened = flagData?.what_happened ?? "A sales conversation occurred where improvement opportunities were identified.";
		const betterResponse = flagData?.better_response ?? "Focus on active listening and addressing customer needs directly.";
		const whyItMatters = flagData?.why_this_matters ?? "This skill is critical for closing deals and building customer trust.";
		const roleExpectation = flagData?.role_expectation ?? "A skilled salesperson should be able to handle this scenario effectively.";
		const revenueImpact = flagData?.revenue_impact ?? "Mastering this skill can significantly impact deal size and close rate.";
		const benchmarkingContext = flagData?.benchmarking_context ?? "Top performers excel at this skill.";
		const patternAnalysis = flagData?.pattern_analysis;
		const validationChecklist = flagData?.validation_checklist ?? [];
		const confidence = flagData?.confidenceOutOf100 ?? 70;

		// Get salesperson name for personalization
		const salespersonName = `${salesperson.salesperson.firstName} ${salesperson.salesperson.lastName}`;

		// Extract transcript excerpt if available
		const transcriptExcerpt = TrainingPromptGenerator.extractTranscriptExcerpt(interaction, flagData);

		// Build the system prompt with enhanced structure
		const systemPrompt = `You are roleplaying as a potential customer in a sales training scenario for ${salespersonName}.

## Training Objective: ${flagTitle}

### What We're Practicing
${salespersonName} needs to improve at: ${flagReason}

### Context from Recent Call
${whatHappened}

${transcriptExcerpt ? `#### Relevant Excerpt from Original Call:\n${transcriptExcerpt}\n` : ""}
### Why This Matters (Business Impact)
${revenueImpact}

${whyItMatters}

### What Success Looks Like
A better approach would be: ${betterResponse}

Role expectation: ${roleExpectation}

### Performance Benchmarking
${benchmarkingContext}

${patternAnalysis ? `#### Pattern Observed:\n${patternAnalysis}\n` : ""}
### Success Criteria (Watch For These)
${validationChecklist.length > 0 ? validationChecklist.map((item) => `- ${item}`).join("\n") : "- Demonstrates understanding of the customer's needs\n- Responds appropriately to objections\n- Maintains professional rapport"}

## Your Role as the Customer

**Your Identity**: You are ${prospectIdentity}. ${salespersonName} is calling you, and you're picking up the phone.${TrainingPromptGenerator.buildCustomerPersona(metadata)}

### Character Instructions
- You are a REAL person, not a training bot. Act like it.
- Speak naturally using conversational language, verbal fillers ("um," "you know," "like"), and realistic speech patterns
- Have legitimate business problems but require ${salespersonName} to uncover them through skilled questioning
- Your engagement level should mirror how well ${salespersonName} performs - warm up to good technique, cool down to poor technique
- NEVER break character to give coaching or meta-commentary

### Persona & Behavioral Rules
- Adopt a realistic persona appropriate to the sales context
- You have competing priorities, budget constraints, and decision-making stakeholders (like a real buyer)
- Express skepticism naturally - you've heard sales pitches before
- React authentically: interrupt if they're long-winded, ask clarifying questions, express confusion if something isn't clear
- Show buying signals only when ${salespersonName} earns them through good technique

### Difficulty Calibration (Confidence Level: ${confidence}%)
${TrainingPromptGenerator.getDifficultyGuidance(confidence, benchmarkingContext)}

### Skill-Specific Behaviors
Based on practicing "${flagReason}", create scenarios that require:
- For qualifying/discovery: Be vague initially, have complex multi-stakeholder situations, require probing questions to reveal budget/timeline/authority
- For objection handling: Present realistic objections at natural moments (price concerns, competitor comparisons, "we're all set")
- For closing: Show buying signals but require ${salespersonName} to explicitly ask for commitment
- For rapport building: Start somewhat formal/guarded, warm up only to genuine connection attempts
- For value articulation: Challenge them to connect features to YOUR specific business outcomes
- For multi-threading: Mention other stakeholders and their concerns naturally

### Natural Response Patterns
- Keep responses conversational and voice-appropriate (short sentences, natural pauses)
- Use realistic verbal cues: "Hmm," "I see," "Tell me more," "I'm not following," "What do you mean by that?"
- Vary engagement: give short responses when disengaged, elaborate when interested
- Occasionally interrupt or redirect if they're monologuing
- Express uncertainty, ask for clarification, or push back naturally

### How to Guide Without Breaking Character
- If ${salespersonName} is struggling: Give subtle verbal cues through your character ("I'm confused about..." or "I still don't see how...")
- If they're doing well: Show increasing engagement and buying signals
- Never say "you should" or "try asking about" - stay in character as a customer

### Scenario Progression & Conclusion
- If they demonstrate "${flagReason}" well: Progress toward a positive outcome (schedule next meeting, agree to trial, share more information)
- If they struggle: Remain polite but stuck at the obstacle ("I'm still not sure this is right for us")
- Natural endings: schedule follow-up, request proposal, politely decline, or cite time constraints
- Aim for a 3-5 minute realistic conversation

## Voice Acting Direction
- Speak like a real person on a business call, not a script
- Use natural pacing, pauses, and conversational rhythms
- Express emotions through tone (curiosity, skepticism, interest, frustration)
- Keep it realistic - you're busy, somewhat skeptical, but willing to engage if ${salespersonName} demonstrates value${companyContext ? CompanyAIContextService.formatContextForPrompt(companyContext) : ""}

Remember: You are creating a safe practice environment that feels real. Challenge ${salespersonName} to demonstrate "${flagReason}" through authentic customer behavior, not through artificial obstacles. Stay in character throughout.`;

		// Generate a contextual first message
		const firstMessage = TrainingPromptGenerator.generateFirstMessage(flagDetails);

		return {
			systemPrompt,
			firstMessage,
		};
	}

	/**
	 * Generate a simple first message that mimics answering a phone call
	 * Uses the opening line from metadata if available, otherwise defaults to "Hello?"
	 */
	private static generateFirstMessage(flagDetails: NonNullable<FlagDetails>): string {
		const metadata = flagDetails.interaction?.metadata as InteractionMetadata | null | undefined;
		const openingLine = metadata?.communication?.openingLine;

		return openingLine ?? "Hello?";
	}

	/**
	 * Provide difficulty guidance based on confidence score and benchmarking
	 */
	private static getDifficultyGuidance(confidence: number, benchmarkingContext: string): string {
		if (confidence >= 80) {
			return `This is a critical skill gap (high confidence flag). Start with moderate difficulty and increase resistance if the salesperson handles it well. Reference: ${benchmarkingContext}`;
		}
		if (confidence >= 60) {
			return `This is a notable improvement area (medium confidence). Calibrate difficulty to be challenging but not overwhelming. Reference: ${benchmarkingContext}`;
		}
		return `This is a potential development area (lower confidence). Start easier and gradually increase difficulty based on performance. Reference: ${benchmarkingContext}`;
	}

	/**
	 * Extract relevant transcript excerpt if timestamps are available
	 */
	private static extractTranscriptExcerpt(
		interaction: NonNullable<FlagDetails>["interaction"],
		flagData: NonNullable<FlagDetails>["flag"]["flagData"],
	): string | null {
		// Check if we have timestamps in flagData
		const timestamps = flagData?.timestamps;
		if (!timestamps?.start && !timestamps?.end) {
			return null;
		}

		// Check if interaction has structured transcription data
		const transcriptionData = interaction?.v1_raw_google_diarized as TranscriptionResult | null | undefined;
		if (!transcriptionData?.segments || transcriptionData.segments.length === 0) {
			// No structured data available
			return null;
		}

		// Parse timestamps (they're strings like "0:45" or "1:23")
		const startSeconds = timestamps.start ? TrainingPromptGenerator.parseTimestamp(timestamps.start) : 0;
		const endSeconds = timestamps.end ? TrainingPromptGenerator.parseTimestamp(timestamps.end) : Number.POSITIVE_INFINITY;

		// Extract segments within the time window (with 5 second buffer before/after)
		const buffer = 5;
		const relevantSegments = transcriptionData.segments.filter((segment) => {
			return segment.endTime >= startSeconds - buffer && segment.startTime <= endSeconds + buffer;
		});

		if (relevantSegments.length === 0) {
			return null;
		}

		// Format as a readable excerpt with speaker labels
		const formattedExcerpt = relevantSegments
			.map((segment) => {
				const speaker = segment.speakerId === "speaker_0" ? "Salesperson" : "Customer";
				return `${speaker}: "${segment.text}"`;
			})
			.join("\n");

		return formattedExcerpt;
	}

	/**
	 * Parse timestamp string (e.g., "1:23" or "0:45") to seconds
	 */
	private static parseTimestamp(timestamp: string): number {
		const parts = timestamp.split(":");
		if (parts.length === 2) {
			const minutes = parseInt(parts[0], 10);
			const seconds = parseInt(parts[1], 10);
			return minutes * 60 + seconds;
		}
		// Try parsing as raw seconds
		const seconds = parseFloat(timestamp);
		return Number.isNaN(seconds) ? 0 : seconds;
	}

	/**
	 * Build a rich prospect identity statement from metadata
	 * Examples:
	 * - "Sarah Johnson, VP of Sales at Acme Corp"
	 * - "Sarah Johnson, VP of Sales"
	 * - "Sarah Johnson at Acme Corp"
	 * - "Alex Morgan, a potential customer" (fallback)
	 */
	private static buildProspectIdentity(metadata: InteractionMetadata | null | undefined): string {
		const name = metadata?.prospect?.name ?? "Alex Morgan";
		const title = metadata?.prospect?.title;
		const company = metadata?.prospect?.company;

		// Build identity based on available information
		if (title && company) {
			return `${name}, ${title} at ${company}`;
		}
		if (title) {
			return `${name}, ${title}`;
		}
		if (company) {
			return `${name} at ${company}`;
		}
		// Fallback for default name
		return `${name}, a potential customer`;
	}

	/**
	 * Generate customer persona guidance from interaction metadata
	 */
	private static buildCustomerPersona(metadata: InteractionMetadata | null | undefined): string {
		if (!metadata) {
			return "";
		}

		const sections: string[] = [];

		// Prospect information - only show additional details not in the identity statement
		if (metadata.prospect) {
			const prospectDetails: string[] = [];
			// Name, title, and company are already in the identity statement, so only show additional info
			if (metadata.prospect.companySize) prospectDetails.push(`**Company Size**: ${metadata.prospect.companySize}`);
			if (metadata.prospect.email) prospectDetails.push(`**Email**: ${metadata.prospect.email}`);
			if (metadata.prospect.phone) prospectDetails.push(`**Phone**: ${metadata.prospect.phone}`);

			if (prospectDetails.length > 0) {
				sections.push(`### Additional Customer Details\n${prospectDetails.join("\n")}`);
			}
		}

		// Company/industry context
		if (metadata.company?.industry) {
			sections.push(
				`**Industry Context**: The customer operates in the ${metadata.company.industry} industry. Your concerns and priorities should reflect this industry's typical challenges.`,
			);
		}

		// Call context
		if (metadata.context) {
			const ctx = metadata.context;
			const contextDetails: string[] = [];

			if (ctx.callType) {
				contextDetails.push(`**Call Type**: This scenario mirrors a ${ctx.callType} call.`);
			}

			if (ctx.callDuration) {
				contextDetails.push(`**Original Call Duration**: The original call lasted ${ctx.callDuration}.`);
			}

			if (ctx.callDate) {
				contextDetails.push(`**Original Call Date**: ${ctx.callDate}`);
			}

			if (contextDetails.length > 0) {
				sections.push(`### Call Background\n${contextDetails.join("\n")}`);
			}
		}

		// Communication patterns - this is the most valuable for voice acting
		if (metadata.communication) {
			const comm = metadata.communication;
			const commDetails: string[] = [];

			if (comm.tone) {
				commDetails.push(`**Emotional Tone**: Adopt a ${comm.tone} demeanor throughout the conversation.`);
			}

			if (comm.communicationStyle) {
				commDetails.push(`**Communication Style**: Embody a ${comm.communicationStyle} approach to the conversation.`);
			}

			if (comm.energyLevel) {
				commDetails.push(`**Energy Level**: Maintain ${comm.energyLevel} throughout the interaction.`);
			}

			if (comm.vocalQualities) {
				commDetails.push(`**Vocal Delivery**: Use ${comm.vocalQualities} in your speech patterns.`);
			}

			if (comm.speechPatterns && comm.speechPatterns.length > 0) {
				commDetails.push(
					`**Speech Patterns**: Mirror these verbal habits from the original customer:\n${comm.speechPatterns.map((pattern) => `  - ${pattern}`).join("\n")}`,
				);
			}

			if (comm.concerns && comm.concerns.length > 0) {
				commDetails.push(
					`**Key Concerns**: The original customer expressed these concerns, which you should naturally bring up:\n${comm.concerns.map((concern) => `  - ${concern}`).join("\n")}`,
				);
			}

			if (commDetails.length > 0) {
				sections.push(`### Customer Communication Profile\n${commDetails.join("\n\n")}`);
			}
		}

		return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
	}
}
