/**
 * PersonaGenerationService - Skill-based training personas
 *
 * ARCHITECTURE NOTE: There are two persona generation services:
 *
 * 1. PersonaGenerationService (this file):
 *    - Generates personas for SKILL-BASED training (objection handling, discovery, etc.)
 *    - Uses training scenarios from the database
 *    - Called from: training/routes.ts for skill practice sessions
 *
 * 2. RoleplayPersonaGeneratorService:
 *    - Generates personas for FLAG-BASED training (specific call moments that need practice)
 *    - Uses flag data + transcript context
 *    - Called from: training/routes.ts for flag-based roleplay, CachedAnalysisService
 *
 * Both generate ElevenLabs-compatible persona prompts but serve different training modes.
 */

import { db } from "#/data";
import * as schema from "#/data/schema";
import type { TranscriptionResult } from "#/services/AudioTranscriptionService";
import { eq, desc, and, gte } from "drizzle-orm";
import { logger } from "#/lib/logger";
import { getAnthropicClient, ANTHROPIC_MODEL } from "#/lib/anthropic";
import { AI } from "#/config";
import { getPrompt } from "#/vantage/slopAsker";
import { CompanyAIContextService } from "./CompanyAIContextService";
import { trainingSkillsPrompt } from "#/lib/prompt/v1";

type CompanyContext = Awaited<ReturnType<typeof CompanyAIContextService.loadCompanyContext>>;

/**
 * Map skill keys to database column names
 */
const SKILL_KEY_MAPPING = {
	objection_handling: "objectionHandlingScore",
	pricing_discussions: "pricingDiscussionsScore",
	discovery: "discoveryFeaturesScore",
	closing: "closingScore",
} as const;

type SkillKey = keyof typeof SKILL_KEY_MAPPING;

/**
 * Transcript pattern data extracted from sales calls
 */
export interface TranscriptPatterns {
	commonProspectTypes: string[];
	commonLanguagePatterns: string[];
	skillSpecificSituations: string[];
	commonBreakdowns: string[];
}

/**
 * Skill gap analysis data
 */
export interface SkillGapAnalysis {
	skillKey: string;
	currentRating: number;
	targetRating: number;
	gapsDescription: string;
}

/**
 * Complete persona prompt data ready for ElevenLabs
 */
export interface PersonaPromptData {
	prompt: string;
	firstMessage: string;
	scenario: typeof schema.trainingScenarios.$inferSelect;
	skillData: SkillGapAnalysis;
}

/**
 * ElevenLabs agent configuration
 */
export interface ElevenLabsConfig {
	prompt: string;
	first_message: string;
	language: string;
	model: string;
	voice_id: string;
	conversation_config: {
		max_duration_seconds: number;
	};
}

/**
 * Psychological persona profile generated for scenarios
 */
export interface PsychologicalPersona {
	coreIdentity: string;
	processingInfo: string;
	fillerWords: string;
	speakingStyle: string;
	currentContext: string;
	psychologicalState: string;
	feelingBeneath: string;
	learnedAboutSalespeople: string;
	earnsRespect: string;
	triggersShutdown: string;
	internalNarrator: string;
	bullshitDetector: string;
	engagementThermostat: string;
	knowledgeNotShared: string;
	mentalModel: string;
	fillerWordExample: string;
	resolutionPositive: string;
	resolutionNegative: string;
	scenarioContext: string;
	scenarioSpecific: string;
	skillName: string;
	// Business context
	personaIndustry: string;
	companySize: string;
	budgetRange: string;
	decisionTimeline: string;
	teamSize: string;
	currentSolution: string;
	dealStage: string;
	buyingAuthority: string;
	commonPainPoints: string;
}

/**
 * Service for generating training personas from real transcript data,
 * skill assessments, and company context
 */
export class PersonaGenerationService {
	/**
	 * Analyze transcript patterns for a salesperson's calls related to a specific skill
	 */
	static async analyzeTranscriptPatterns(salespersonId: number, skillKey: string): Promise<TranscriptPatterns> {
		try {
			// Fetch recent sales calls with transcripts (last 20)
			const calls = await db
				.select({
					id: schema.interactions.id,
					blurb: schema.interactions.blurb,
					transcript: schema.interactions.v1_raw_google_diarized,
					metadata: schema.interactions.metadata,
				})
				.from(schema.interactions)
				.where(eq(schema.interactions.salespersonId, salespersonId))
				.orderBy(desc(schema.interactions.createdAt))
				.limit(20);

			// Filter to only calls with transcripts
			const callsWithTranscripts = calls.filter((call) => call.transcript?.segments);

			if (callsWithTranscripts.length === 0) {
				logger.info({ salespersonId, skillKey }, "No transcripts found, using generic patterns");
				return PersonaGenerationService.getGenericPatterns(skillKey);
			}

			// Extract patterns based on skill type
			const patterns = PersonaGenerationService.extractSkillPatterns(callsWithTranscripts, skillKey);

			logger.info({ salespersonId, skillKey, callsAnalyzed: callsWithTranscripts.length }, "Analyzed transcript patterns");

			return patterns;
		} catch (error) {
			logger.error({ error, salespersonId, skillKey }, "Failed to analyze transcript patterns");
			return PersonaGenerationService.getGenericPatterns(skillKey);
		}
	}

	/**
	 * Extract skill-specific patterns from transcripts
	 */
	private static extractSkillPatterns(
		calls: Array<{
			transcript: TranscriptionResult | null;
			metadata: schema.InteractionMetadata | null;
			blurb: string;
		}>,
		skillKey: string,
	): TranscriptPatterns {
		const prospectTypes = new Set<string>();
		const languagePatterns = new Set<string>();
		const situations = new Set<string>();
		const breakdowns = new Set<string>();

		// Skill-specific keywords to search for
		const skillKeywords: Record<string, string[]> = {
			objection_handling: ["but", "concern", "worried about", "issue with", "not sure", "hesitant"],
			pricing_discussions: ["price", "cost", "budget", "expensive", "afford", "ROI", "investment", "cheaper"],
			discovery: ["need", "looking for", "problem", "challenge", "goal", "current", "why", "how"],
			closing: ["next step", "move forward", "timeline", "when", "decision", "sign", "contract", "start"],
		};

		const keywords = skillKeywords[skillKey] || [];

		for (const call of calls) {
			// Extract prospect info from metadata
			if (call.metadata?.prospect) {
				const { title, company } = call.metadata.prospect;
				if (title) prospectTypes.add(title);
				if (company) prospectTypes.add(`${company} type company`);
			}

			// Analyze transcript segments
			if (call.transcript?.segments) {
				for (const segment of call.transcript.segments) {
					const text = segment.text.toLowerCase();

					// Look for skill-specific language
					for (const keyword of keywords) {
						if (text.includes(keyword)) {
							// Extract a bit of context around the keyword
							const sentenceStart = Math.max(0, text.indexOf(keyword) - 30);
							const sentenceEnd = Math.min(text.length, text.indexOf(keyword) + 50);
							const snippet = text.slice(sentenceStart, sentenceEnd).trim();
							languagePatterns.add(snippet);

							// Track as a situation
							situations.add(`Prospect mentions "${keyword}"`);
						}
					}
				}
			}

			// Use blurb to extract situations
			const blurbLower = call.blurb.toLowerCase();
			for (const keyword of keywords) {
				if (blurbLower.includes(keyword)) {
					situations.add(call.blurb);
				}
			}
		}

		// Get common breakdowns based on skill type
		const commonBreakdownsBySkill: Record<string, string[]> = {
			objection_handling: [
				"Responding defensively instead of acknowledging concerns",
				"Failing to ask clarifying questions about the objection",
				"Moving too quickly to rebuttals without listening",
			],
			pricing_discussions: [
				"Leading with price before establishing value",
				"Discounting too quickly without exploring budget",
				"Failing to quantify ROI in specific terms",
			],
			discovery: [
				"Asking surface-level questions without digging deeper",
				"Talking more than listening",
				"Failing to understand the business impact of the problem",
			],
			closing: [
				"Being too passive and not asking for commitment",
				"Allowing prospects to push decisions indefinitely",
				"Not establishing clear next steps and timelines",
			],
		};

		return {
			commonProspectTypes: Array.from(prospectTypes).slice(0, 5),
			commonLanguagePatterns: Array.from(languagePatterns).slice(0, 10),
			skillSpecificSituations: Array.from(situations).slice(0, 8),
			commonBreakdowns: commonBreakdownsBySkill[skillKey] || [],
		};
	}

	/**
	 * Get generic patterns when no transcript data is available
	 */
	private static getGenericPatterns(skillKey: string): TranscriptPatterns {
		const genericPatterns: Record<string, TranscriptPatterns> = {
			objection_handling: {
				commonProspectTypes: ["Operations Director", "VP Sales", "CFO"],
				commonLanguagePatterns: ["I'm concerned about...", "We already have a solution", "The timing isn't right"],
				skillSpecificSituations: [
					"Prospect raises budget concerns",
					"Prospect compares to competitors",
					"Prospect questions implementation complexity",
				],
				commonBreakdowns: [
					"Responding defensively instead of acknowledging concerns",
					"Failing to ask clarifying questions about the objection",
				],
			},
			pricing_discussions: {
				commonProspectTypes: ["Procurement Manager", "CFO", "Business Owner"],
				commonLanguagePatterns: ["What's your pricing?", "That's more than we budgeted", "Can you sharpen your pencil?"],
				skillSpecificSituations: [
					"Prospect asks about pricing early",
					"Prospect pushes for discounts",
					"Prospect compares pricing to competitors",
				],
				commonBreakdowns: ["Leading with price before establishing value", "Discounting too quickly without exploring budget"],
			},
			discovery: {
				commonProspectTypes: ["VP Operations", "Director of Sales", "Department Head"],
				commonLanguagePatterns: ["We're looking for...", "Our current challenge is...", "We need help with..."],
				skillSpecificSituations: [
					"Prospect describes their problem",
					"Prospect mentions current workarounds",
					"Prospect discusses team challenges",
				],
				commonBreakdowns: ["Asking surface-level questions without digging deeper", "Talking more than listening"],
			},
			closing: {
				commonProspectTypes: ["Decision Maker", "Executive Sponsor", "Project Lead"],
				commonLanguagePatterns: ["Let me think about it", "I need to discuss with my team", "What are the next steps?"],
				skillSpecificSituations: ["Prospect is ready but hesitant", "Prospect needs internal approval", "Prospect wants to move forward"],
				commonBreakdowns: ["Being too passive and not asking for commitment", "Not establishing clear next steps and timelines"],
			},
		};

		return genericPatterns[skillKey] || genericPatterns.discovery;
	}

	/**
	 * Get skill gap analysis for a salesperson and specific skill
	 */
	static async getSkillGapAnalysis(salespersonId: number, skillKey: string): Promise<SkillGapAnalysis> {
		try {
			// Validate skill key
			if (!(skillKey in SKILL_KEY_MAPPING)) {
				logger.warn({ skillKey }, "Invalid skill key, using discovery as default");
				skillKey = "discovery";
			}

			const typedSkillKey = skillKey as SkillKey;
			const columnName = SKILL_KEY_MAPPING[typedSkillKey];

			// Get recent skill assessments (last 30 days)
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

			const assessments = await db
				.select()
				.from(schema.skillsAssessments)
				.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
				.where(and(eq(schema.interactions.salespersonId, salespersonId), gte(schema.skillsAssessments.createdAt, thirtyDaysAgo)))
				.orderBy(desc(schema.skillsAssessments.createdAt))
				.limit(10);

			if (assessments.length === 0) {
				logger.info({ salespersonId, skillKey }, "No skill assessments found, using default");
				return {
					skillKey,
					currentRating: 5,
					targetRating: 7,
					gapsDescription: PersonaGenerationService.getGapsDescription(5),
				};
			}

			// Calculate average rating for this skill
			let totalScore = 0;
			let validScores = 0;

			for (const assessment of assessments) {
				const score = assessment.skills_assessments[columnName];
				if (score && score > 0) {
					totalScore += score;
					validScores++;
				}
			}

			const currentRating = validScores > 0 ? Math.round(totalScore / validScores) : 5;
			const targetRating = Math.min(10, currentRating + 2);

			logger.info({ salespersonId, skillKey, currentRating, assessmentsAnalyzed: assessments.length }, "Calculated skill gap analysis");

			return {
				skillKey,
				currentRating,
				targetRating,
				gapsDescription: PersonaGenerationService.getGapsDescription(currentRating),
			};
		} catch (error) {
			logger.error({ error, salespersonId, skillKey }, "Failed to get skill gap analysis");
			return {
				skillKey,
				currentRating: 5,
				targetRating: 7,
				gapsDescription: PersonaGenerationService.getGapsDescription(5),
			};
		}
	}

	/**
	 * Get gaps description based on current rating
	 */
	private static getGapsDescription(rating: number): string {
		if (rating <= 3) {
			return "Fundamental skill gaps - struggles with basic mechanics and concepts";
		}
		if (rating <= 6) {
			return "Developing skill - misses nuance and advanced techniques";
		}
		return "Strong foundation - needs refinement on edge cases and complex scenarios";
	}

	/**
	 * Generate complete persona prompt for a training scenario
	 */
	static async generatePersonaPrompt(scenarioId: number, salespersonId: number): Promise<PersonaPromptData> {
		// Fetch the training scenario
		const scenarios = await db.select().from(schema.trainingScenarios).where(eq(schema.trainingScenarios.id, scenarioId)).limit(1);

		if (scenarios.length === 0) {
			throw new Error(`Training scenario ${scenarioId} not found`);
		}

		const scenario = scenarios[0];

		// Get salesperson info for company context
		const salespersonData = await db
			.select({
				id: schema.salespeople.id,
				firstName: schema.salespeople.firstName,
				lastName: schema.salespeople.lastName,
				companyId: schema.salespeople.companyId,
			})
			.from(schema.salespeople)
			.where(eq(schema.salespeople.id, salespersonId))
			.limit(1);

		if (salespersonData.length === 0) {
			throw new Error(`Salesperson ${salespersonId} not found`);
		}

		const salesperson = salespersonData[0];

		// Get company training data (static product info)
		const companyTrainingData = await db
			.select()
			.from(schema.companyTrainingData)
			.where(eq(schema.companyTrainingData.companyId, salesperson.companyId))
			.limit(1);

		const companyContext = companyTrainingData.length > 0 ? companyTrainingData[0] : null;

		// Load company AI context (The Brain - learned patterns from calls)
		let companyAIContextFormatted: string | undefined;
		try {
			const companyAIContext = await CompanyAIContextService.loadCompanyContext(salesperson.companyId);
			companyAIContextFormatted = CompanyAIContextService.formatContextForPrompt(companyAIContext);
			logger.info({ salespersonId, companyId: salesperson.companyId }, "Loaded company brain context for scenario training");
		} catch (error) {
			logger.warn({ error, salespersonId, companyId: salesperson.companyId }, "Failed to load company AI context for scenario training");
		}

		// Analyze patterns and get skill data in parallel
		const [transcriptPatterns, skillGapAnalysis] = await Promise.all([
			PersonaGenerationService.analyzeTranscriptPatterns(salespersonId, scenario.skillKey),
			PersonaGenerationService.getSkillGapAnalysis(salespersonId, scenario.skillKey),
		]);

		// Build the complete persona prompt (now async to load custom prompt)
		// Includes both static company context AND AI-learned patterns
		const prompt = await PersonaGenerationService.buildPersonaPrompt(
			scenario,
			transcriptPatterns,
			skillGapAnalysis,
			companyContext,
			companyAIContextFormatted,
		);

		const firstMessage = scenario.firstMessage ?? scenario.context;

		logger.info({ scenarioId, salespersonId, skillKey: scenario.skillKey }, "Generated persona prompt");

		return {
			prompt,
			firstMessage,
			scenario,
			skillData: skillGapAnalysis,
		};
	}

	/**
	 * Replace template variables in custom prompt for scenario-based training
	 * Uses AI to generate rich psychological personas
	 */
	private static async replaceScenarioTemplateVariables(
		template: string,
		scenario: typeof schema.trainingScenarios.$inferSelect,
		patterns: TranscriptPatterns,
		skillData: SkillGapAnalysis,
		companyContext: typeof schema.companyTrainingData.$inferSelect | null,
		companyAIContext?: string,
	): Promise<string> {
		let result = template;

		// Generate psychological persona using AI
		const persona = await PersonaGenerationService.generatePsychologicalPersonaWithAI(
			scenario,
			scenario.skillKey,
			patterns,
			skillData,
			companyContext,
			companyAIContext,
		);

		// Prospect/scenario variables
		result = result.replace(/\{\{PROSPECT_NAME\}\}/g, scenario.prospectData.name);
		result = result.replace(/\{\{PROSPECT_ROLE\}\}/g, scenario.prospectData.role);
		result = result.replace(/\{\{PROSPECT_COMPANY\}\}/g, scenario.prospectData.company);
		result = result.replace(/\{\{PERSONALITY\}\}/g, scenario.prospectData.personality);
		result = result.replace(/\{\{AI_PROMPT\}\}/g, scenario.aiPrompt);
		result = result.replace(/\{\{SCENARIO\}\}/g, scenario.scenario);
		result = result.replace(/\{\{CONTEXT\}\}/g, scenario.context);
		result = result.replace(/\{\{TITLE\}\}/g, scenario.title);
		result = result.replace(/\{\{IDEAL_OUTCOME\}\}/g, scenario.idealOutcome);
		result = result.replace(/\{\{DURATION\}\}/g, scenario.duration);
		result = result.replace(/\{\{FIRST_MESSAGE\}\}/g, scenario.firstMessage ?? scenario.context);

		// Skill variables
		const skillKeyFormatted = scenario.skillKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
		result = result.replace(/\{\{SKILL_KEY\}\}/g, skillKeyFormatted);
		result = result.replace(/\{\{SKILL_NAME\}\}/g, persona.skillName);
		result = result.replace(/\{\{CURRENT_RATING\}\}/g, skillData.currentRating.toString());
		result = result.replace(/\{\{TARGET_RATING\}\}/g, skillData.targetRating.toString());
		result = result.replace(/\{\{SKILL_GAPS\}\}/g, skillData.gapsDescription);

		// Objectives and objections
		result = result.replace(/\{\{OBJECTIVES\}\}/g, scenario.objectives.map((obj) => `  - ${obj}`).join("\n"));
		result = result.replace(/\{\{COMMON_OBJECTIONS\}\}/g, scenario.commonObjections.map((obj) => `  - ${obj}`).join("\n"));

		// Psychological persona variables (from trainingSkillsPrompt template)
		result = result.replace(/\{\{PERSONA_NAME\}\}/g, scenario.prospectData.name);
		result = result.replace(/\{\{PERSONA_ROLE\}\}/g, scenario.prospectData.role);
		result = result.replace(/\{\{PERSONA_COMPANY\}\}/g, scenario.prospectData.company);
		result = result.replace(/\{\{PERSONA_INDUSTRY\}\}/g, persona.personaIndustry);
		result = result.replace(/\{\{COMPANY_SIZE\}\}/g, persona.companySize);
		result = result.replace(/\{\{BUDGET_RANGE\}\}/g, persona.budgetRange);
		result = result.replace(/\{\{DECISION_TIMELINE\}\}/g, persona.decisionTimeline);
		result = result.replace(/\{\{TEAM_SIZE\}\}/g, persona.teamSize);
		result = result.replace(/\{\{CURRENT_SOLUTION\}\}/g, persona.currentSolution);
		result = result.replace(/\{\{DEAL_STAGE\}\}/g, persona.dealStage);
		result = result.replace(/\{\{BUYING_AUTHORITY\}\}/g, persona.buyingAuthority);
		result = result.replace(/\{\{COMMON_PAIN_POINTS\}\}/g, persona.commonPainPoints);

		// Psychological profile variables
		result = result.replace(/\{\{CORE_IDENTITY\}\}/g, persona.coreIdentity);
		result = result.replace(/\{\{PROCESSING_INFO\}\}/g, persona.processingInfo);
		result = result.replace(/\{\{FILLER_WORDS\}\}/g, persona.fillerWords);
		result = result.replace(/\{\{FILLER_WORD_EXAMPLE\}\}/g, persona.fillerWordExample);
		result = result.replace(/\{\{SPEAKING_STYLE\}\}/g, persona.speakingStyle);
		result = result.replace(/\{\{CURRENT_CONTEXT\}\}/g, persona.currentContext);
		result = result.replace(/\{\{PSYCHOLOGICAL_STATE\}\}/g, persona.psychologicalState);
		result = result.replace(/\{\{FEELING_BENEATH\}\}/g, persona.feelingBeneath);
		result = result.replace(/\{\{LEARNED_ABOUT_SALESPEOPLE\}\}/g, persona.learnedAboutSalespeople);
		result = result.replace(/\{\{EARNS_RESPECT\}\}/g, persona.earnsRespect);
		result = result.replace(/\{\{TRIGGERS_SHUTDOWN\}\}/g, persona.triggersShutdown);
		result = result.replace(/\{\{INTERNAL_NARRATOR\}\}/g, persona.internalNarrator);
		result = result.replace(/\{\{BULLSHIT_DETECTOR\}\}/g, persona.bullshitDetector);
		result = result.replace(/\{\{ENGAGEMENT_THERMOSTAT\}\}/g, persona.engagementThermostat);
		result = result.replace(/\{\{KNOWLEDGE_NOT_SHARED\}\}/g, persona.knowledgeNotShared);
		result = result.replace(/\{\{MENTAL_MODEL\}\}/g, persona.mentalModel);
		result = result.replace(/\{\{RESOLUTION_POSITIVE\}\}/g, persona.resolutionPositive);
		result = result.replace(/\{\{RESOLUTION_NEGATIVE\}\}/g, persona.resolutionNegative);
		result = result.replace(/\{\{SCENARIO_CONTEXT\}\}/g, persona.scenarioContext);
		result = result.replace(/\{\{SCENARIO_SPECIFIC\}\}/g, persona.scenarioSpecific);

		// Pattern variables
		result = result.replace(
			/\{\{PROSPECT_TYPES\}\}/g,
			patterns.commonProspectTypes.map((p) => `  - ${p}`).join("\n") || "  - Various business roles",
		);
		result = result.replace(
			/\{\{LANGUAGE_PATTERNS\}\}/g,
			patterns.commonLanguagePatterns
				.slice(0, 5)
				.map((p) => `  - "${p}"`)
				.join("\n") || '  - "Let me think about it"',
		);
		result = result.replace(
			/\{\{SKILL_SITUATIONS\}\}/g,
			patterns.skillSpecificSituations
				.slice(0, 5)
				.map((s) => `  - ${s}`)
				.join("\n") || "  - Various sales scenarios",
		);
		result = result.replace(/\{\{COMMON_BREAKDOWNS\}\}/g, patterns.commonBreakdowns.map((b) => `  - ${b}`).join("\n"));

		// Difficulty calibration
		const difficultyCalibration = PersonaGenerationService.getDifficultyCalibration(skillData.currentRating);
		result = result.replace(/\{\{DIFFICULTY_CALIBRATION\}\}/g, difficultyCalibration);

		// Company context (static + AI-learned)
		const contextParts: string[] = [];

		if (companyContext) {
			if (companyContext.productPositioning) {
				contextParts.push(`**Product Context**: ${companyContext.productPositioning.slice(0, 300)}...`);
			}

			if (companyContext.targetCustomerProfile) {
				contextParts.push(`**Target Customer Profile**: ${companyContext.targetCustomerProfile.slice(0, 300)}...`);
			}
		}

		// Add AI-learned patterns from Company Brain
		if (companyAIContext) {
			contextParts.push(`**Learned Patterns (Company Brain)**:\n${companyAIContext}`);
		}

		const contextSection = contextParts.length > 0 ? contextParts.join("\n\n") : "";
		result = result.replace(/\{\{COMPANY_CONTEXT\}\}/g, contextSection);

		return result;
	}

	/**
	 * Build the complete persona prompt with all context
	 */
	private static async buildPersonaPrompt(
		scenario: typeof schema.trainingScenarios.$inferSelect,
		patterns: TranscriptPatterns,
		skillData: SkillGapAnalysis,
		companyContext: typeof schema.companyTrainingData.$inferSelect | null,
		companyAIContext?: string,
	): Promise<string> {
		const SECTION_DIVIDER = "═".repeat(60);

		// Load custom prompt from database
		const customPrompt = await getPrompt("training_scenario");

		// If custom prompt exists, use it with variable replacement (async - uses AI for persona)
		if (customPrompt && customPrompt.trim() !== "") {
			return await PersonaGenerationService.replaceScenarioTemplateVariables(
				customPrompt,
				scenario,
				patterns,
				skillData,
				companyContext,
				companyAIContext,
			);
		}

		// Otherwise use the trainingSkillsPrompt template with AI-generated persona
		const defaultTemplate = trainingSkillsPrompt();
		return await PersonaGenerationService.replaceScenarioTemplateVariables(
			defaultTemplate,
			scenario,
			patterns,
			skillData,
			companyContext,
			companyAIContext,
		);
	}

	/**
	 * Generate a rich psychological persona using AI (Claude)
	 * This creates varied, realistic personas for each training session
	 */
	private static async generatePsychologicalPersonaWithAI(
		scenario: typeof schema.trainingScenarios.$inferSelect,
		skillKey: string,
		patterns: TranscriptPatterns,
		skillData: SkillGapAnalysis,
		companyContext?: typeof schema.companyTrainingData.$inferSelect | null,
		companyAIContext?: string,
	): Promise<PsychologicalPersona> {
		const anthropic = getAnthropicClient();
		const { name, role, company, personality } = scenario.prospectData;
		const skillFormatted = skillKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

		// Build context for Claude
		const contextParts: string[] = [];
		contextParts.push(`**Scenario:** ${scenario.scenario}`);
		contextParts.push(`**Prospect:** ${name}, ${role} at ${company}`);
		contextParts.push(`**Personality Hints:** ${personality}`);
		contextParts.push(`**Skill Being Practiced:** ${skillFormatted}`);
		contextParts.push(`**Rep's Current Skill Level:** ${skillData.currentRating}/10 (${skillData.gapsDescription})`);
		contextParts.push(`**Training Objectives:** ${scenario.objectives.join(", ")}`);
		contextParts.push(`**Common Objections to Raise:** ${scenario.commonObjections.join(", ")}`);
		contextParts.push(`**First Message/Opening:** ${scenario.firstMessage ?? scenario.context}`);

		if (patterns.commonLanguagePatterns.length > 0) {
			contextParts.push(`**Language Patterns from Real Calls:** ${patterns.commonLanguagePatterns.slice(0, 5).join("; ")}`);
		}
		if (patterns.skillSpecificSituations.length > 0) {
			contextParts.push(`**Situations from Real Calls:** ${patterns.skillSpecificSituations.slice(0, 5).join("; ")}`);
		}
		if (companyContext?.productPositioning) {
			contextParts.push(`**Product Being Sold:** ${companyContext.productPositioning.slice(0, 200)}`);
		}
		if (companyAIContext) {
			contextParts.push(`**Company Brain (Learned Patterns):**\n${companyAIContext}`);
		}

		const prompt = `You are a sales training persona designer. Create a RICH, REALISTIC psychological profile for a sales roleplay training scenario.

## CONTEXT
${contextParts.join("\n\n")}

## YOUR TASK
Generate a complete psychological persona profile. This persona will be used to train salespeople on "${skillFormatted}".

The persona should:
- Feel like a REAL person with genuine psychology, not a cardboard cutout
- Have authentic internal thoughts, beliefs, and reactions
- Be grounded in realistic business context
- Create a meaningful challenge for practicing ${skillFormatted}
- Be varied and interesting (not generic)

## OUTPUT FORMAT
Return ONLY valid JSON matching this exact structure (no markdown code blocks):

{
  "coreIdentity": "Who they are fundamentally - their professional identity and what drives them",
  "processingInfo": "How they think and process information during sales conversations",
  "fillerWords": "Comma-separated list of their natural filler words (e.g., 'so, I mean, basically')",
  "fillerWordExample": "Their most characteristic filler word",
  "speakingStyle": "How they communicate - pace, directness, detail level",
  "currentContext": "What's happening for them right now that brings them to this conversation",
  "psychologicalState": "Their internal mental state at this moment",
  "feelingBeneath": "What they're feeling beneath the surface that they won't say directly",
  "learnedAboutSalespeople": "What past experiences have taught them about salespeople",
  "earnsRespect": "What a salesperson can do to earn their engagement and trust",
  "triggersShutdown": "What causes them to disengage or get defensive",
  "internalNarrator": "The voice in their head that's evaluating the salesperson in real-time",
  "bullshitDetector": "What sets off their BS detector - what they're watching for",
  "engagementThermostat": "How their engagement level adjusts up and down based on the conversation",
  "knowledgeNotShared": "Information they have but haven't revealed - context they're holding back",
  "mentalModel": "How they think about their problem and potential solutions",
  "resolutionPositive": "What internal shift indicates they're satisfied - the conversation went well",
  "resolutionNegative": "What indicates they're done but unsatisfied - the conversation failed",
  "scenarioContext": "The specific situation framing this conversation",
  "scenarioSpecific": "Details specific to this scenario and skill practice",
  "skillName": "${skillFormatted}",
  "personaIndustry": "Their industry",
  "companySize": "Their company size description",
  "budgetRange": "Their budget constraints",
  "decisionTimeline": "When they need to make a decision",
  "teamSize": "How many people are affected",
  "currentSolution": "What they're currently using",
  "dealStage": "Where they are in their buying journey",
  "buyingAuthority": "Their role in the buying decision",
  "commonPainPoints": "Bullet list of their specific pain points"
}

Generate a unique, realistic persona. Be creative but grounded. Make them feel REAL.`;

		try {
			logger.debug({ scenario: scenario.title, skillKey }, "Generating psychological persona with AI");

			const response = await anthropic.messages.create({
				model: ANTHROPIC_MODEL,
				max_tokens: AI.MAX_TOKENS.ROLEPLAY_FULL,
				messages: [{ role: "user", content: prompt }],
			});

			const textBlock = response.content.find((block) => block.type === "text");
			if (!textBlock || textBlock.type !== "text") {
				throw new Error("No text response from Claude");
			}

			let text = textBlock.text.trim();
			// Remove markdown code blocks if present
			const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				text = jsonMatch[1].trim();
			}

			const persona = JSON.parse(text) as PsychologicalPersona;

			logger.info(
				{ scenario: scenario.title, skillKey, personaIdentity: persona.coreIdentity?.slice(0, 50) },
				"Generated AI psychological persona",
			);

			return persona;
		} catch (error) {
			logger.error({ error, scenario: scenario.title, skillKey }, "Failed to generate AI persona");
			throw error;
		}
	}

	/**
	 * Get difficulty calibration based on skill rating
	 */
	private static getDifficultyCalibration(rating: number): string {
		if (rating <= 3) {
			return `**Beginner-Friendly Approach:**
- Give clear signals when they're on the right track
- Be patient with fumbles and awkward phrasing
- Offer second chances if they stumble
- Provide obvious buying signals when they do well
- Be forgiving of minor mistakes`;
		}

		if (rating <= 6) {
			return `**Realistic Approach:**
- React naturally to their approach
- Normal expectations for a business conversation
- Give signals but don't make them obvious
- Allow them to recover from mistakes
- Be realistic but fair`;
		}

		return `**Advanced Approach:**
- Hold them to high standards
- Subtle signals that require reading between the lines
- Less forgiving of generic approaches
- Expect nuance and sophistication
- Challenge assumptions and push back on weak points`;
	}

	/**
	 * Generate ElevenLabs configuration
	 */
	static async generateElevenLabsConfig(scenarioId: number, salespersonId: number): Promise<ElevenLabsConfig> {
		const personaData = await PersonaGenerationService.generatePersonaPrompt(scenarioId, salespersonId);

		// Select voice based on prospect gender/personality (simplified for now)
		// In a real implementation, you might want to have voice IDs configured per scenario
		const voiceId = AI.ELEVENLABS.ALT_VOICE_ID;

		return {
			prompt: personaData.prompt,
			first_message: personaData.firstMessage,
			language: "en",
			model: "eleven_turbo_v2_5",
			voice_id: voiceId,
			conversation_config: {
				max_duration_seconds: 600, // 10 minutes
			},
		};
	}
}
