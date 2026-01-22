import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq } from "drizzle-orm";

/**
 * Call types inferred during analysis - maps to sales phases for context filtering
 */
export type CallType = "discovery" | "demo" | "negotiation" | "closing" | "follow-up";

/**
 * Sales phases used for organizing patterns and battle cards
 */
export type SalesPhase = "outreach" | "discovery" | "demo" | "close";

/**
 * Mapping from inferred call types to relevant sales phases
 * A call type may map to multiple phases (e.g., negotiation involves both demo and close tactics)
 */
const CALL_TYPE_TO_PHASES: Record<CallType, SalesPhase[]> = {
	discovery: ["outreach", "discovery"],
	demo: ["discovery", "demo"],
	negotiation: ["demo", "close"],
	closing: ["close"],
	"follow-up": ["discovery", "close"], // Follow-up could be re-discovery or closing
};

/**
 * Keywords associated with each sales phase for pattern filtering
 */
const PHASE_KEYWORDS: Record<SalesPhase, string[]> = {
	outreach: ["cold call", "intro", "first contact", "prospecting", "opening", "attention"],
	discovery: ["discovery", "needs", "pain point", "challenge", "problem", "question", "understand", "qualify"],
	demo: ["demo", "presentation", "feature", "benefit", "value prop", "pricing", "solution", "show"],
	close: ["close", "commit", "next step", "decision", "contract", "sign", "objection", "negotiate", "discount"],
};

/**
 * Service for loading company-specific AI context learned from feedback
 */
export class CompanyAIContextService {
	/**
	 * Load all AI context for a company
	 */
	static async loadCompanyContext(companyId: number) {
		const contexts = await db.select().from(schema.companyAiContext).where(eq(schema.companyAiContext.companyId, companyId));

		// Organize by context type for easy access
		const contextMap: Partial<
			Record<(typeof schema.companyAiContext.$inferSelect)["contextType"], (typeof schema.companyAiContext.$inferSelect)["data"]>
		> = {};

		for (const ctx of contexts) {
			contextMap[ctx.contextType] = ctx.data;
		}

		// Load company training data with example calls
		const trainingData = await db.select().from(schema.companyTrainingData).where(eq(schema.companyTrainingData.companyId, companyId));

		const trainingDataRecord = trainingData.length > 0 ? trainingData[0] : null;

		return {
			salesLanguage: contextMap.sales_language as
				| {
						commonPhrases: Array<{ phrase: string; count: number }>;
						productTerms: Array<{ term: string; count: number }>;
				  }
				| undefined,
			objectionPatterns: contextMap.objection_patterns as
				| {
						patterns: Array<{
							objectionType: string;
							successfulResponse: string;
							frequency: number;
						}>;
				  }
				| undefined,
			successPatterns: contextMap.success_patterns as
				| {
						topPerformerTechniques: string[];
						winningStrategies: string[];
				  }
				| undefined,
			terminology: contextMap.terminology as
				| {
						glossary: Record<string, string>;
						productNames: string[];
				  }
				| undefined,
			antiPatterns: contextMap.anti_patterns as
				| {
						avoidPatterns: Array<{
							pattern: string;
							reason: string;
							frequency: number;
						}>;
				  }
				| undefined,
			// Feedback-learned patterns
			flagQualityPatterns: contextMap.flag_quality_patterns as
				| {
						goodFlagPatterns: Array<{ flagType: string; rating: number; context: unknown }>;
						badFlagPatterns: Array<{ flagType: string; reason: string; context: unknown }>;
						summary: { totalGoodFlags: number; totalBadFlags: number };
				  }
				| undefined,
			betterResponses: contextMap.better_responses as
				| {
						responses: Array<{
							situation: string;
							originalResponse: string;
							betterResponse: string;
							coachReasoning: string;
						}>;
						count: number;
				  }
				| undefined,
			battleCardImprovements: contextMap.battle_card_improvements as
				| {
						improvements: Array<{
							battleCardTitle: string;
							fieldChanged: string;
							originalValue: string;
							newValue: string;
						}>;
						count: number;
				  }
				| undefined,
			// Performer-based patterns
			topPerformerPatterns: contextMap.top_performer_patterns as
				| {
						topPerformerIds: number[];
						avgScoreThreshold: number;
						successPatterns: Array<{ skill: string; technique: string; example: string }>;
						commonSkills: Record<string, number>;
				  }
				| undefined,
			bottomPerformerPatterns: contextMap.bottom_performer_patterns as
				| {
						bottomPerformerIds: number[];
						avgScoreThreshold: number;
						commonMistakes: Array<{ skill: string; mistake: string; frequency: number }>;
						skillsToImprove: Record<string, number>;
				  }
				| undefined,
			skillGapPatterns: contextMap.skill_gap_patterns as
				| {
						available: boolean;
						skillRankings: Array<{ skill: string; avg: number }>;
						weakestSkill: string;
						strongestSkill: string;
						specificGaps: string[];
						recommendedFocus: string[];
				  }
				| undefined,
			exampleCalls: trainingDataRecord
				? {
						goodCall: trainingDataRecord.exampleGoodCall ?? undefined,
						badCall: trainingDataRecord.exampleBadCall ?? undefined,
						averageCall: trainingDataRecord.exampleAverageCall ?? undefined,
					}
				: undefined,
			// Additional training data from companyTrainingData table
			trainingData: trainingDataRecord
				? {
						onboardingDocument: trainingDataRecord.onboardingDocument ?? undefined,
						idealResponses: trainingDataRecord.idealResponses ?? undefined,
						objectionHandlingGuide: trainingDataRecord.objectionHandlingGuide ?? undefined,
						productPositioning: trainingDataRecord.productPositioning ?? undefined,
						competitorInfo: trainingDataRecord.competitorInfo ?? undefined,
						companyValues: trainingDataRecord.companyValues ?? undefined,
						targetCustomerProfile: trainingDataRecord.targetCustomerProfile ?? undefined,
						salesMethodology: trainingDataRecord.salesMethodology ?? undefined,
						companyFaq: trainingDataRecord.companyFaq ?? undefined,
					}
				: undefined,
		};
	}

	/**
	 * Check if a pattern/text is relevant to the given call type
	 */
	private static isRelevantToCallType(text: string, callType: CallType): boolean {
		const relevantPhases = CALL_TYPE_TO_PHASES[callType];
		const textLower = text.toLowerCase();

		// Check if any keyword from relevant phases appears in the text
		for (const phase of relevantPhases) {
			const keywords = PHASE_KEYWORDS[phase];
			for (const keyword of keywords) {
				if (textLower.includes(keyword.toLowerCase())) {
					return true;
				}
			}
		}

		// If no specific keywords found, include it (don't be overly restrictive)
		return true;
	}

	/**
	 * Get relevant phases for a call type
	 */
	static getRelevantPhases(callType: CallType): SalesPhase[] {
		return CALL_TYPE_TO_PHASES[callType];
	}

	/**
	 * Format company context for inclusion in AI prompts
	 * @param context - The loaded company context
	 * @param callType - Optional call type to filter patterns for relevance (prevents noise in prompts)
	 */
	static formatContextForPrompt(
		context: Awaited<ReturnType<typeof CompanyAIContextService.loadCompanyContext>>,
		callType?: CallType,
	): string {
		const sections: string[] = [];
		const relevantPhases = callType ? CALL_TYPE_TO_PHASES[callType] : undefined;

		// Sales Language & Terminology
		if (context.terminology?.productNames && context.terminology.productNames.length > 0) {
			sections.push(`**Company Products/Services**: ${context.terminology.productNames.slice(0, 5).join(", ")}`);
		}

		if (context.salesLanguage?.productTerms && context.salesLanguage.productTerms.length > 0) {
			const topTerms = context.salesLanguage.productTerms
				.slice(0, 5)
				.map((t) => t.term)
				.join(", ");
			sections.push(`**Common Sales Terms**: Use terms like: ${topTerms}`);
		}

		// Success Patterns (Top Performer Techniques) - filter by call type relevance
		if (context.successPatterns?.topPerformerTechniques && context.successPatterns.topPerformerTechniques.length > 0) {
			let techniques = context.successPatterns.topPerformerTechniques;
			if (callType) {
				techniques = techniques.filter((t) => this.isRelevantToCallType(t, callType));
			}
			const topTechniques = techniques.slice(0, 3);
			if (topTechniques.length > 0) {
				sections.push(`**Top Performer Techniques** (reward these approaches):\n${topTechniques.map((t) => `  - ${t}`).join("\n")}`);
			}
		}

		// Objection Patterns (what works at this company) - filter by call type relevance
		if (context.objectionPatterns?.patterns && context.objectionPatterns.patterns.length > 0) {
			let patterns = context.objectionPatterns.patterns;
			if (callType) {
				patterns = patterns.filter(
					(p) => this.isRelevantToCallType(p.objectionType, callType) || this.isRelevantToCallType(p.successfulResponse, callType),
				);
			}
			const topObjections = patterns.slice(0, 3);
			if (topObjections.length > 0) {
				sections.push(
					`**Common Objections & Successful Responses**:\n${topObjections
						.map((p) => `  - ${p.objectionType}: ${p.successfulResponse}`)
						.join("\n")}`,
				);
			}
		}

		// Anti-Patterns (what to avoid) - filter by call type relevance
		if (context.antiPatterns?.avoidPatterns && context.antiPatterns.avoidPatterns.length > 0) {
			let patterns = context.antiPatterns.avoidPatterns;
			if (callType) {
				patterns = patterns.filter((p) => this.isRelevantToCallType(p.pattern, callType));
			}
			const topAntiPatterns = patterns.slice(0, 3);
			if (topAntiPatterns.length > 0) {
				sections.push(
					`**Patterns to Avoid** (these got low ratings):\n${topAntiPatterns.map((p) => `  - ${p.pattern} (${p.reason})`).join("\n")}`,
				);
			}
		}

		// NOTE: Example Calls (exampleGoodCall, exampleBadCall, exampleAverageCall) are intentionally
		// EXCLUDED from analysis context. Including full hour-long transcripts in every API call would:
		// 1. Be extremely expensive (100k+ tokens × 4 calls per interaction)
		// 2. Overload the AI context window
		// 3. Break Anthropic prompt caching (context changes = no cache hits)
		//
		// Instead, use CalibrationService to run one-time pattern extraction. The extracted patterns
		// (success_patterns, anti_patterns, sales_language, terminology) ARE included above and used
		// in all analysis (rating, flagging, extraction, persona) plus roleplay generation.

		// Training Data - Company knowledge base
		if (context.trainingData) {
			// Company FAQ - Most comprehensive source
			if (context.trainingData.companyFaq) {
				sections.push(`**Company FAQ**:\n${context.trainingData.companyFaq}`);
			}

			// Company Overview / Onboarding
			if (context.trainingData.onboardingDocument) {
				sections.push(`**Company Overview**:\n${context.trainingData.onboardingDocument}`);
			}

			// Product Positioning
			if (context.trainingData.productPositioning) {
				sections.push(`**Product Positioning & Messaging**:\n${context.trainingData.productPositioning}`);
			}

			// Target Customer Profile
			if (context.trainingData.targetCustomerProfile) {
				sections.push(`**Ideal Customer Profile (ICP)**:\n${context.trainingData.targetCustomerProfile}`);
			}

			// Sales Methodology
			if (context.trainingData.salesMethodology) {
				sections.push(`**Sales Methodology**:\n${context.trainingData.salesMethodology}`);
			}

			// Company Values
			if (context.trainingData.companyValues && context.trainingData.companyValues.length > 0) {
				sections.push(`**Company Values**:\n${context.trainingData.companyValues.map((v) => `  - ${v}`).join("\n")}`);
			}

			// Objection Handling Guide
			if (context.trainingData.objectionHandlingGuide) {
				const objections = Object.entries(context.trainingData.objectionHandlingGuide).slice(0, 5);
				if (objections.length > 0) {
					const objectionGuide = objections.map(([objection, guide]) => `  - **${objection}**: ${guide.response_strategy}`).join("\n");
					sections.push(`**Objection Handling Guide**:\n${objectionGuide}`);
				}
			}

			// Competitor Info
			if (context.trainingData.competitorInfo) {
				const competitors = Object.entries(context.trainingData.competitorInfo).slice(0, 3);
				if (competitors.length > 0) {
					const competitorInfo = competitors.map(([name, info]) => `  - **${name}**: ${info.positioning}`).join("\n");
					sections.push(`**Competitor Positioning**:\n${competitorInfo}`);
				}
			}

			// Ideal Responses
			if (context.trainingData.idealResponses) {
				const responses = Object.entries(context.trainingData.idealResponses).slice(0, 3);
				if (responses.length > 0) {
					const idealResponses = responses.map(([scenario, response]) => `  - **${scenario}**: ${response.ideal_response}`).join("\n");
					sections.push(`**Ideal Responses for Common Scenarios**:\n${idealResponses}`);
				}
			}
		}

		// Coach-Learned Better Responses - filter by call type relevance
		if (context.betterResponses?.responses && context.betterResponses.responses.length > 0) {
			let responses = context.betterResponses.responses;
			if (callType) {
				responses = responses.filter(
					(r) => this.isRelevantToCallType(r.situation, callType) || this.isRelevantToCallType(r.betterResponse, callType),
				);
			}
			const topResponses = responses.slice(0, 3);
			if (topResponses.length > 0) {
				sections.push(
					`**Coach-Recommended Responses** (learned from feedback):\n${topResponses
						.map((r) => `  - **${r.situation}**: ${r.betterResponse}${r.coachReasoning ? ` (${r.coachReasoning})` : ""}`)
						.join("\n")}`,
				);
			}
		}

		// Top Performer Patterns - filter by call type relevance
		if (context.topPerformerPatterns?.successPatterns && context.topPerformerPatterns.successPatterns.length > 0) {
			let patterns = context.topPerformerPatterns.successPatterns;
			if (callType) {
				patterns = patterns.filter((p) => this.isRelevantToCallType(p.skill, callType) || this.isRelevantToCallType(p.technique, callType));
			}
			const topPatterns = patterns.slice(0, 3);
			if (topPatterns.length > 0) {
				sections.push(
					`**Top Performer Techniques** (from your best reps):\n${topPatterns.map((p) => `  - **${p.skill}**: ${p.technique}`).join("\n")}`,
				);
			}
		}

		// Bottom Performer Mistakes (what to flag) - filter by call type relevance
		if (context.bottomPerformerPatterns?.commonMistakes && context.bottomPerformerPatterns.commonMistakes.length > 0) {
			let mistakes = context.bottomPerformerPatterns.commonMistakes;
			if (callType) {
				mistakes = mistakes.filter((m) => this.isRelevantToCallType(m.skill, callType) || this.isRelevantToCallType(m.mistake, callType));
			}
			const topMistakes = mistakes.slice(0, 3);
			if (topMistakes.length > 0) {
				sections.push(
					`**Common Mistakes to Flag** (from lower performers):\n${topMistakes
						.map((m) => `  - **${m.skill}**: ${m.mistake} (seen ${m.frequency}x)`)
						.join("\n")}`,
				);
			}
		}

		// Skill Gaps (priority focus areas)
		if (context.skillGapPatterns?.available && context.skillGapPatterns.recommendedFocus) {
			sections.push(
				`**Team Skill Gaps** (prioritize these):\n  - Weakest: ${context.skillGapPatterns.weakestSkill}\n  - Focus on: ${context.skillGapPatterns.recommendedFocus.join(", ")}`,
			);
		}

		// Flag Quality Patterns (what makes good vs bad flags)
		if (context.flagQualityPatterns?.badFlagPatterns && context.flagQualityPatterns.badFlagPatterns.length > 0) {
			const badPatterns = context.flagQualityPatterns.badFlagPatterns.slice(0, 3);
			sections.push(
				`**Flags to Avoid** (reps reported these as unhelpful):\n${badPatterns.map((p) => `  - ${p.flagType}: ${p.reason}`).join("\n")}`,
			);
		}

		// Battle Card Manager Improvements (what managers changed in AI-generated content)
		// This helps the AI learn manager preferences for battle card style and content
		if (context.battleCardImprovements?.improvements && context.battleCardImprovements.improvements.length > 0) {
			const improvements = context.battleCardImprovements.improvements.slice(0, 5);
			sections.push(
				`**Manager Battle Card Preferences** (learned from edits):\n${improvements
					.map(
						(i) =>
							`  - **${i.fieldChanged}** on "${i.battleCardTitle}": Changed from "${i.originalValue.slice(0, 50)}${i.originalValue.length > 50 ? "..." : ""}" to "${i.newValue.slice(0, 50)}${i.newValue.length > 50 ? "..." : ""}"`,
					)
					.join("\n")}`,
			);
		}

		// Common Sales Phrases (what language the team uses)
		if (context.salesLanguage?.commonPhrases && context.salesLanguage.commonPhrases.length > 0) {
			const topPhrases = context.salesLanguage.commonPhrases
				.slice(0, 5)
				.map((p) => p.phrase)
				.join(", ");
			sections.push(`**Common Sales Phrases**: ${topPhrases}`);
		}

		if (sections.length === 0) {
			return "";
		}

		const callTypeLabel = callType ? ` - Filtered for ${callType} calls` : "";
		return `\n\n## Company-Specific Context (Learned from Your Team${callTypeLabel})\n\n${sections.join("\n\n")}`;
	}

	/**
	 * Get objection-specific context for a flag
	 */
	static getObjectionContext(
		context: Awaited<ReturnType<typeof CompanyAIContextService.loadCompanyContext>>,
		flagReason: string,
	): string | null {
		if (!context.objectionPatterns?.patterns) {
			return null;
		}

		// Find a relevant objection pattern
		const relevantPattern = context.objectionPatterns.patterns.find((p) =>
			p.objectionType.toLowerCase().includes(flagReason.toLowerCase()),
		);

		if (!relevantPattern) {
			return null;
		}

		return `**Company-Learned Response**: Based on successful calls from your team, here's what works for this objection: "${relevantPattern.successfulResponse}"`;
	}

	/**
	 * Get anti-patterns to avoid for specific scenarios
	 */
	static getAntiPatternsForScenario(
		context: Awaited<ReturnType<typeof CompanyAIContextService.loadCompanyContext>>,
		flagReason: string,
	): string[] {
		if (!context.antiPatterns?.avoidPatterns) {
			return [];
		}

		// Find relevant anti-patterns for this scenario
		return context.antiPatterns.avoidPatterns
			.filter((p) => p.pattern.toLowerCase().includes(flagReason.toLowerCase()))
			.slice(0, 2)
			.map((p) => p.pattern);
	}

	/**
	 * Convenience method: Format context filtered by sales phase (for battle cards, training)
	 * Maps sales phase to relevant call types for filtering
	 */
	static formatContextForPhase(context: Awaited<ReturnType<typeof CompanyAIContextService.loadCompanyContext>>, phase: SalesPhase): string {
		// Map phase to a representative call type for filtering
		const phaseToCallType: Record<SalesPhase, CallType> = {
			outreach: "discovery",
			discovery: "discovery",
			demo: "demo",
			close: "closing",
		};
		return this.formatContextForPrompt(context, phaseToCallType[phase]);
	}
}
