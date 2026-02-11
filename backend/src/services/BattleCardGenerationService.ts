/**
 * BattleCardGenerationService - Generates battle cards from aggregated insights
 *
 * Phase 2 of the extraction pipeline creates battle cards for the top objections
 * and pain points, along with linked training roleplay scenarios.
 *
 * Battle Card Structure:
 * - Title: Name of the objection/pain point
 * - Challenge: Description of the challenge
 * - Phase: Sales phase (outreach, discovery, demo, close)
 * - Strategy: High-level approach summary
 * - Approach: 3 tactical bullet points
 * - Script: Example script to handle the situation
 * - Next Step: Recommended follow-up action
 */

import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "#/lib/logger";
import { getAnthropicClient, ANTHROPIC_MODEL } from "#/lib/anthropic";
import { AI } from "#/config";
import type { AggregatedObjection, AggregatedPainPoint } from "./InsightsAggregationService";
import { CompanyAIContextService } from "./CompanyAIContextService";

// ============================================================================
// TYPES
// ============================================================================

export interface BattleCardContent {
	title: string;
	challenge: string;
	phase: "outreach" | "discovery" | "demo" | "close";
	strategy: string;
	approach: string[];
	script: string;
	nextStep: string;
}

export interface GeneratedBattleCard extends BattleCardContent {
	sourceType: "objection" | "pain_point";
	sourceId: number;
	frequency: number;
	successRate: number;
	impactScore: number;
}

export interface TrainingScenarioContent {
	title: string;
	difficulty: string;
	duration: string;
	context: string;
	scenario: string;
	objectives: string[];
	commonObjections: string[];
	idealOutcome: string;
	aiPrompt: string;
	firstMessage: string; // Natural opening line to start the roleplay
	prospectData: {
		name: string;
		company: string;
		role: string;
		personality: string;
	};
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Extract JSON from Claude response, handling markdown code blocks and prefixes
 */
function extractJson(text: string): string {
	// First, try to extract from markdown code blocks
	const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		return jsonMatch[1].trim();
	}

	// If not valid JSON yet, try to find the JSON object in the text
	if (!text.startsWith("{")) {
		const firstBrace = text.indexOf("{");
		const lastBrace = text.lastIndexOf("}");
		if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
			return text.substring(firstBrace, lastBrace + 1);
		}
	}

	return text;
}

// ============================================================================
// BATTLE CARD GENERATION
// ============================================================================

/**
 * Generate a battle card from an aggregated objection
 */
export async function generateBattleCardFromObjection(objection: AggregatedObjection, companyContext?: string): Promise<BattleCardContent> {
	const anthropic = getAnthropicClient();

	const prompt = `You are a sales training expert. Generate a battle card for handling the following sales objection.

OBJECTION DATA:
- Title: ${objection.title}
- Description: ${objection.description}
- Sales Phase: ${objection.phase}
- Frequency: ${objection.frequency} times
- Success Rate: ${objection.successRate}% overcome
- Impact Score: ${objection.impactScore}

${
	objection.topExamples.length > 0
		? `REAL EXAMPLES FROM CALLS:
${objection.topExamples
	.map(
		(ex, i) => `
Example ${i + 1}:
- Customer said: "${ex.verbatimQuote}"
- Rep responded: "${ex.repResponse}"
- Effectiveness: ${ex.effectiveness}
`,
	)
	.join("\n")}`
		: ""
}

${companyContext ? `COMPANY CONTEXT:\n${companyContext}` : ""}

Generate a battle card in JSON format with:
1. strategy: A concise (1 sentence) reframe of how to approach this objection
2. approach: Array of exactly 3 tactical bullet points (specific, actionable)
3. script: An example script (2-3 sentences) the rep can use or adapt
4. nextStep: The recommended follow-up action after handling the objection

The tone should be confident but not pushy. Focus on understanding the customer's real concern.

Respond with ONLY valid JSON in this exact format:
{
  "strategy": "...",
  "approach": ["...", "...", "..."],
  "script": "...",
  "nextStep": "..."
}`;

	const response = await anthropic.messages.create({
		model: ANTHROPIC_MODEL,
		max_tokens: AI.MAX_TOKENS.BATTLE_CARD,
		messages: [{ role: "user", content: prompt }],
	});

	const content = response.content[0];
	if (content.type !== "text") {
		throw new Error("Unexpected response type from Claude");
	}

	const parsed = JSON.parse(extractJson(content.text)) as {
		strategy: string;
		approach: string[];
		script: string;
		nextStep: string;
	};

	return {
		title: objection.title,
		challenge: objection.description,
		phase: objection.phase as "outreach" | "discovery" | "demo" | "close",
		strategy: parsed.strategy,
		approach: parsed.approach,
		script: parsed.script,
		nextStep: parsed.nextStep,
	};
}

/**
 * Generate a battle card from an aggregated pain point
 */
export async function generateBattleCardFromPainPoint(painPoint: AggregatedPainPoint, companyContext?: string): Promise<BattleCardContent> {
	const anthropic = getAnthropicClient();

	const painType = painPoint.isProspectPain ? "Prospect Pain Point" : "Sales Rep Challenge";

	const prompt = `You are a sales training expert. Generate a battle card for addressing the following ${painType.toLowerCase()}.

PAIN POINT DATA:
- Title: ${painPoint.title}
- Description: ${painPoint.description}
- Type: ${painType}
- Sales Phase: ${painPoint.phase}
- Frequency: ${painPoint.frequency} times
- ${painPoint.isProspectPain ? "Capitalization" : "Resolution"} Rate: ${painPoint.resolutionRate}%
- Impact Score: ${painPoint.impactScore}

${
	painPoint.topExamples.length > 0
		? `REAL EXAMPLES FROM CALLS:
${painPoint.topExamples
	.map(
		(ex, i) => `
Example ${i + 1}:
- Customer said: "${ex.verbatimQuote}"
${ex.capitalizedOn !== undefined ? `- Rep capitalized on it: ${ex.capitalizedOn ? "Yes" : "No"}` : ""}
${ex.capitalizationQuote ? `- Rep's response: "${ex.capitalizationQuote}"` : ""}
${ex.rootCause ? `- Root cause: ${ex.rootCause}` : ""}
`,
	)
	.join("\n")}`
		: ""
}

${companyContext ? `COMPANY CONTEXT:\n${companyContext}` : ""}

Generate a battle card in JSON format with:
1. strategy: A concise (1 sentence) approach to ${painPoint.isProspectPain ? "capitalize on this pain point" : "address this challenge"}
2. approach: Array of exactly 3 tactical bullet points (specific, actionable)
3. script: An example script (2-3 sentences) the rep can use
4. nextStep: The recommended follow-up action

${painPoint.isProspectPain ? "Focus on how to use this pain point to build urgency and show value." : "Focus on how to overcome this challenge and improve performance."}

Respond with ONLY valid JSON in this exact format:
{
  "strategy": "...",
  "approach": ["...", "...", "..."],
  "script": "...",
  "nextStep": "..."
}`;

	const response = await anthropic.messages.create({
		model: ANTHROPIC_MODEL,
		max_tokens: AI.MAX_TOKENS.BATTLE_CARD,
		messages: [{ role: "user", content: prompt }],
	});

	const content = response.content[0];
	if (content.type !== "text") {
		throw new Error("Unexpected response type from Claude");
	}

	const parsed = JSON.parse(extractJson(content.text)) as {
		strategy: string;
		approach: string[];
		script: string;
		nextStep: string;
	};

	return {
		title: painPoint.title,
		challenge: painPoint.description,
		phase: painPoint.phase as "outreach" | "discovery" | "demo" | "close",
		strategy: parsed.strategy,
		approach: parsed.approach,
		script: parsed.script,
		nextStep: parsed.nextStep,
	};
}

// ============================================================================
// TRAINING SCENARIO GENERATION
// ============================================================================

/**
 * Generate a training roleplay scenario for a battle card
 * The scenario starts naturally within the context being practiced
 */
export async function generateTrainingScenario(
	battleCard: BattleCardContent,
	sourceType: "objection" | "pain_point",
): Promise<TrainingScenarioContent> {
	const anthropic = getAnthropicClient();

	const situationType = sourceType === "objection" ? "objection" : "situation";

	const prompt = `You are a sales training expert. Create a roleplay training scenario for practicing how to handle the following ${situationType}.

BATTLE CARD:
- Title: ${battleCard.title}
- Challenge: ${battleCard.challenge}
- Sales Phase: ${battleCard.phase}
- Strategy: ${battleCard.strategy}
- Approach: ${battleCard.approach.join("; ")}
- Example Script: ${battleCard.script}

IMPORTANT: The roleplay must start NATURALLY within the scenario being practiced. The prospect's first message should be them raising the ${situationType} or expressing the concern - NOT a greeting or small talk. The salesperson is practicing how to RESPOND to this specific ${situationType}.

Generate a realistic roleplay scenario in JSON format:

{
  "title": "A descriptive title for the scenario",
  "duration": "10-15 min",
  "context": "Brief setup context (1-2 sentences) - what's happening in the call when this moment occurs",
  "scenario": "Full scenario description (2-3 paragraphs) describing the situation, what led to this moment, and what the prospect is thinking",
  "objectives": ["Learning objective 1", "Learning objective 2", "Learning objective 3"],
  "commonObjections": ["Potential follow-up objection 1", "Potential follow-up objection 2"],
  "idealOutcome": "What success looks like in this scenario",
  "aiPrompt": "Detailed prompt for AI to roleplay as the prospect (include personality, concerns, what would convince them). The AI should start by expressing the ${situationType} naturally.",
  "firstMessage": "The prospect's opening line that raises the ${situationType}. This is what the salesperson must respond to. Make it natural and realistic - exactly what a real prospect would say when raising this concern. NO greetings - start directly with the ${situationType}.",
  "prospectData": {
    "name": "Realistic prospect name",
    "company": "Realistic company name",
    "role": "Prospect's job title",
    "personality": "Brief personality description"
  }
}

Examples of good firstMessage for different ${situationType}s:
- Budget: "Look, I'm going to be honest with you - we just don't have the budget for this right now. Our Q1 numbers were rough."
- Timing: "This all sounds great, but honestly, we're in the middle of a huge migration project. I can't take on anything else until that's done."
- Competition: "We're actually pretty happy with what we're using now. I'm not sure I see the value in switching."

Make it realistic. The prospect should feel like a real person with genuine concerns.`;

	const response = await anthropic.messages.create({
		model: ANTHROPIC_MODEL,
		max_tokens: AI.MAX_TOKENS.BATTLE_CARD_GENERATION,
		messages: [{ role: "user", content: prompt }],
	});

	const content = response.content[0];
	if (content.type !== "text") {
		throw new Error("Unexpected response type from Claude");
	}

	const parsed = JSON.parse(extractJson(content.text)) as Omit<TrainingScenarioContent, "difficulty">;

	return {
		...parsed,
		difficulty: "Intermediate", // Consistent difficulty for all scenarios
	};
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Save a generated battle card to the database
 */
export async function saveBattleCard(
	companyId: number,
	battleCard: BattleCardContent,
	sourceType: "objection" | "pain_point",
	sourceId: number,
	metrics: { frequency: number; successRate: number; impactScore: number },
): Promise<number> {
	const [inserted] = await db
		.insert(schema.battleCards)
		.values({
			companyId,
			title: battleCard.title,
			challenge: battleCard.challenge,
			phase: battleCard.phase,
			strategy: battleCard.strategy,
			approach: battleCard.approach,
			script: battleCard.script,
			nextStep: battleCard.nextStep,
			sourceType,
			sourceId,
			frequency: metrics.frequency,
			successRate: String(metrics.successRate),
			impactScore: String(metrics.impactScore),
			difficultyLevel: calculateDifficulty(metrics.successRate),
		})
		.returning();

	return inserted.id;
}

/**
 * Save a generated training scenario to the database
 */
export async function saveTrainingScenario(battleCardId: number, scenario: TrainingScenarioContent, skillKey: string): Promise<number> {
	const scenarioId = `battle_card_${battleCardId}_${Date.now()}`;

	const [inserted] = await db
		.insert(schema.trainingScenarios)
		.values({
			skillKey,
			scenarioId,
			title: scenario.title,
			difficulty: scenario.difficulty,
			duration: scenario.duration,
			participants: 2,
			context: scenario.context,
			scenario: scenario.scenario,
			objectives: scenario.objectives,
			commonObjections: scenario.commonObjections,
			idealOutcome: scenario.idealOutcome,
			aiPrompt: scenario.aiPrompt,
			firstMessage: scenario.firstMessage,
			prospectData: scenario.prospectData,
		})
		.returning();

	// Link the scenario to the battle card
	await db.update(schema.battleCards).set({ linkedScenarioId: inserted.id }).where(eq(schema.battleCards.id, battleCardId));

	return inserted.id;
}

/**
 * Calculate difficulty level based on success rate (lower success = higher difficulty)
 */
function calculateDifficulty(successRate: number): number {
	if (successRate >= 80) return 1; // Easy - high success rate
	if (successRate >= 60) return 2;
	if (successRate >= 40) return 3;
	if (successRate >= 20) return 4;
	return 5; // Hard - low success rate
}

/**
 * Map sales phase to skill key
 */
function phaseToSkillKey(phase: string, sourceType: "objection" | "pain_point"): string {
	if (sourceType === "objection") {
		return "objection_handling";
	}

	switch (phase) {
		case "outreach":
			return "prospecting";
		case "discovery":
			return "discovery_needs_analysis";
		case "demo":
			return "product_demonstration";
		case "close":
			return "closing_next_steps";
		default:
			return "general_sales";
	}
}

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Check if a battle card already exists for a source
 */
async function battleCardExistsForSource(sourceType: string, sourceId: number): Promise<boolean> {
	const existing = await db
		.select({ id: schema.battleCards.id })
		.from(schema.battleCards)
		.where(and(eq(schema.battleCards.sourceType, sourceType), eq(schema.battleCards.sourceId, sourceId)))
		.limit(1);
	return existing.length > 0;
}

/**
 * Generate battle cards and training scenarios for top objections
 * Skips items that already have battle cards
 */
export async function generateBattleCardsForObjections(
	companyId: number,
	objections: AggregatedObjection[],
	companyContext?: string,
): Promise<{ battleCardId: number; scenarioId: number }[]> {
	const results: { battleCardId: number; scenarioId: number }[] = [];

	for (const objection of objections) {
		try {
			// Check if battle card already exists for this objection
			const existingBattleCard = await db
				.select()
				.from(schema.battleCards)
				.where(and(eq(schema.battleCards.sourceType, "objection"), eq(schema.battleCards.sourceId, objection.id)))
				.limit(1);

			let battleCardId: number;
			let battleCardContent: BattleCardContent;

			if (existingBattleCard.length > 0) {
				// Battle card exists - check if it needs a scenario
				const existing = existingBattleCard[0];
				if (existing.linkedScenarioId) {
					logger.info({ objectionId: objection.id, title: objection.title }, "Battle card with scenario already exists, skipping");
					continue;
				}

				// Battle card exists but no scenario - generate scenario only
				logger.info({ battleCardId: existing.id, title: objection.title }, "Battle card exists without scenario, generating scenario");
				battleCardId = existing.id;
				battleCardContent = {
					title: existing.title,
					challenge: existing.challenge,
					phase: existing.phase as "outreach" | "discovery" | "demo" | "close",
					strategy: existing.strategy,
					approach: existing.approach,
					script: existing.script,
					nextStep: existing.nextStep,
				};
			} else {
				// No battle card exists - generate both
				logger.info({ objectionId: objection.id, title: objection.title }, "Generating battle card for objection");

				// Generate the battle card content
				battleCardContent = await generateBattleCardFromObjection(objection, companyContext);

				// Save to database
				battleCardId = await saveBattleCard(companyId, battleCardContent, "objection", objection.id, {
					frequency: objection.frequency,
					successRate: objection.successRate,
					impactScore: objection.impactScore,
				});
			}

			// Generate and save training scenario
			const scenarioContent = await generateTrainingScenario(battleCardContent, "objection");
			const skillKey = phaseToSkillKey(objection.phase, "objection");
			const scenarioId = await saveTrainingScenario(battleCardId, scenarioContent, skillKey);

			results.push({ battleCardId, scenarioId });

			logger.info({ battleCardId, scenarioId, title: objection.title }, "Generated battle card and scenario");
		} catch (error) {
			logger.error({ error, objectionId: objection.id }, "Failed to generate battle card for objection");
		}
	}

	return results;
}

/**
 * Generate battle cards and training scenarios for top pain points
 * Also generates scenarios for existing battle cards that don't have them
 */
export async function generateBattleCardsForPainPoints(
	companyId: number,
	painPoints: AggregatedPainPoint[],
	companyContext?: string,
): Promise<{ battleCardId: number; scenarioId: number }[]> {
	const results: { battleCardId: number; scenarioId: number }[] = [];

	for (const painPoint of painPoints) {
		try {
			// Check if battle card already exists for this pain point
			const existingBattleCard = await db
				.select()
				.from(schema.battleCards)
				.where(and(eq(schema.battleCards.sourceType, "pain_point"), eq(schema.battleCards.sourceId, painPoint.id)))
				.limit(1);

			let battleCardId: number;
			let battleCardContent: BattleCardContent;

			if (existingBattleCard.length > 0) {
				// Battle card exists - check if it needs a scenario
				const existing = existingBattleCard[0];
				if (existing.linkedScenarioId) {
					logger.info({ painPointId: painPoint.id, title: painPoint.title }, "Battle card with scenario already exists, skipping");
					continue;
				}

				// Battle card exists but no scenario - generate scenario only
				logger.info({ battleCardId: existing.id, title: painPoint.title }, "Battle card exists without scenario, generating scenario");
				battleCardId = existing.id;
				battleCardContent = {
					title: existing.title,
					challenge: existing.challenge,
					phase: existing.phase as "outreach" | "discovery" | "demo" | "close",
					strategy: existing.strategy,
					approach: existing.approach,
					script: existing.script,
					nextStep: existing.nextStep,
				};
			} else {
				// No battle card exists - generate both
				logger.info({ painPointId: painPoint.id, title: painPoint.title }, "Generating battle card for pain point");

				// Generate the battle card content
				battleCardContent = await generateBattleCardFromPainPoint(painPoint, companyContext);

				// Save to database
				battleCardId = await saveBattleCard(companyId, battleCardContent, "pain_point", painPoint.id, {
					frequency: painPoint.frequency,
					successRate: painPoint.resolutionRate,
					impactScore: painPoint.impactScore,
				});
			}

			// Generate and save training scenario
			const scenarioContent = await generateTrainingScenario(battleCardContent, "pain_point");
			const skillKey = phaseToSkillKey(painPoint.phase, "pain_point");
			const scenarioId = await saveTrainingScenario(battleCardId, scenarioContent, skillKey);

			results.push({ battleCardId, scenarioId });

			logger.info({ battleCardId, scenarioId, title: painPoint.title }, "Generated battle card and scenario");
		} catch (error) {
			logger.error({ error, painPointId: painPoint.id }, "Failed to generate battle card for pain point");
		}
	}

	return results;
}

/**
 * Get all active battle cards for a company
 */
export async function getActiveBattleCards(companyId: number) {
	return db
		.select()
		.from(schema.battleCards)
		.where(and(eq(schema.battleCards.companyId, companyId), eq(schema.battleCards.isActive, true)))
		.orderBy(desc(schema.battleCards.impactScore));
}

/**
 * Get battle card by ID with linked scenario
 */
export async function getBattleCardWithScenario(battleCardId: number) {
	const [battleCard] = await db.select().from(schema.battleCards).where(eq(schema.battleCards.id, battleCardId)).limit(1);

	if (!battleCard) return null;

	let scenario = null;
	if (battleCard.linkedScenarioId) {
		const [linkedScenario] = await db
			.select()
			.from(schema.trainingScenarios)
			.where(eq(schema.trainingScenarios.id, battleCard.linkedScenarioId))
			.limit(1);
		scenario = linkedScenario;
	}

	return { battleCard, scenario };
}

/**
 * Auto-generate battle cards for top objections and pain points
 * This is called after extraction to ensure battle cards exist for the top 3 items
 * Uses the aggregation service to get the top items by impact score
 */
export async function autoGenerateBattleCardsForCompany(companyId: number): Promise<{
	generated: number;
	skipped: number;
}> {
	// Import here to avoid circular dependency
	const { generateWeeklyInsights } = await import("./InsightsAggregationService");

	logger.info({ companyId }, "Auto-generating battle cards for company");

	// Load company context (The Brain) for personalized battle cards
	let companyContextFormatted: string | undefined;
	try {
		const companyContext = await CompanyAIContextService.loadCompanyContext(companyId);
		companyContextFormatted = CompanyAIContextService.formatContextForPrompt(companyContext);
		logger.info({ companyId }, "Loaded company brain context for battle card generation");
	} catch (error) {
		logger.warn({ error, companyId }, "Failed to load company context for battle cards");
	}

	// Get the current aggregated insights (top 3 by impact score)
	const insights = await generateWeeklyInsights(companyId, new Date());

	let generated = 0;
	let skipped = 0;

	// Generate battle cards for top objections (with company context)
	const objectionResults = await generateBattleCardsForObjections(companyId, insights.topObjections, companyContextFormatted);
	generated += objectionResults.length;
	skipped += insights.topObjections.length - objectionResults.length;

	// Generate battle cards for top prospect pain points (with company context)
	const prospectPainResults = await generateBattleCardsForPainPoints(companyId, insights.topProspectPainPoints, companyContextFormatted);
	generated += prospectPainResults.length;
	skipped += insights.topProspectPainPoints.length - prospectPainResults.length;

	// Note: We don't generate battle cards for rep pain points as they're internal coaching items
	// Rep pain points are handled differently in training

	logger.info(
		{
			companyId,
			generated,
			skipped,
			topObjections: insights.topObjections.length,
			topProspectPainPoints: insights.topProspectPainPoints.length,
		},
		"Completed auto-generation of battle cards",
	);

	return { generated, skipped };
}
