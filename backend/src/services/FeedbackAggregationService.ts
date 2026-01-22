import { db, computeRawInteractionText } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, gte, lte, sql, desc, asc, avg } from "drizzle-orm";
import { logger } from "#/lib/logger";

/**
 * Service that aggregates feedback data from multiple sources to build
 * company-specific AI training context and labeled examples.
 *
 * Data Sources:
 * - Rep ratings (1-10 helpfulness scores on flags)
 * - Coach notes (manager feedback on flags)
 * - Bad flag reports (rep feedback on poor AI suggestions)
 * - Battle cards (edited tactical guides)
 * - Onboarding FAQ/document (company knowledge base)
 * - Ideal responses (company-defined best practices)
 * - Rep benchmarking (top vs low performers based on skill scores)
 *
 * This service should run periodically (daily/weekly) or on feedback events.
 */
export class FeedbackAggregationService {
	/**
	 * Aggregate all feedback for a specific company
	 */
	static async aggregateCompanyFeedback(companyId: number): Promise<void> {
		logger.info({ companyId }, "Starting feedback aggregation");

		// Get all salespeople for this company
		const salespeople = await db.select().from(schema.salespeople).where(eq(schema.salespeople.companyId, companyId));

		const salespersonIds = salespeople.map((sp) => sp.id);

		if (salespersonIds.length === 0) {
			logger.info({ companyId }, "No salespeople found for company");
			return;
		}

		// Run all aggregation tasks in parallel
		await Promise.all([
			this.extractSalesLanguage(companyId, salespersonIds),
			this.extractObjectionPatterns(companyId, salespersonIds),
			this.extractSuccessPatterns(companyId, salespersonIds),
			this.extractTerminology(companyId, salespersonIds),
			this.extractAntiPatterns(companyId, salespersonIds),
			this.extractBattleCardStrategies(companyId),
			this.extractOnboardingKnowledge(companyId),
			this.extractCoachNotes(companyId, salespersonIds),
			this.extractRepBenchmarks(companyId, salespersonIds),
			this.extractIdealResponses(companyId),
			this.createTrainingExamples(companyId, salespersonIds),
			// New feedback-based learning
			this.processFeedbackEvents(companyId),
			// New performer-based pattern extraction
			this.extractTopPerformerPatterns(companyId),
			this.extractBottomPerformerPatterns(companyId),
			this.extractSkillGapPatterns(companyId),
		]);

		logger.info({ companyId }, "Completed feedback aggregation");
	}

	/**
	 * Extract common sales language patterns from transcripts
	 */
	private static async extractSalesLanguage(companyId: number, salespersonIds: number[]): Promise<void> {
		// Get all interactions for this company's salespeople
		const interactions = await db
			.select()
			.from(schema.interactions)
			.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
			.where(eq(schema.salespeople.companyId, companyId))
			.limit(1000); // Sample recent interactions

		// Extract common phrases from transcripts
		// This is a simplified version - in production, use NLP/embeddings
		const commonPhrases: string[] = [];
		const productMentions: string[] = [];

		for (const row of interactions) {
			const interaction = row.interactions;
			if (interaction.v1_raw_google_diarized?.segments) {
				// Simple phrase extraction (would use NLP in production)
				const segments = interaction.v1_raw_google_diarized.segments;
				for (const segment of segments) {
					const text = segment.text?.toLowerCase() ?? "";
					// Extract potential product mentions (capitalized words)
					const words = text.split(/\s+/);
					for (const word of words) {
						if (word.length > 3 && word[0] === word[0].toUpperCase()) {
							productMentions.push(word);
						}
					}
				}
			}
		}

		// Count frequency and deduplicate
		const phraseFrequency = this.countFrequency(commonPhrases);
		const productFrequency = this.countFrequency(productMentions);

		// Store in company_ai_context
		await this.upsertContext(
			companyId,
			"sales_language",
			{
				commonPhrases: Object.entries(phraseFrequency)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 50)
					.map(([phrase, count]) => ({ phrase, count })),
				productTerms: Object.entries(productFrequency)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 20)
					.map(([term, count]) => ({ term, count })),
			},
			interactions.length,
		);
	}

	/**
	 * Extract objection handling patterns from high-rated flags
	 */
	private static async extractObjectionPatterns(companyId: number, salespersonIds: number[]): Promise<void> {
		// Get all flags with high rep ratings (8-10) for this company
		const highRatedFlags = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), gte(schema.flags.repRating, 8)))
			.limit(500);

		const objectionPatterns: Array<{
			objectionType: string;
			successfulResponse: string;
			frequency: number;
		}> = [];

		for (const row of highRatedFlags) {
			const flag = row.flags;
			if (flag.flagData?.better_response && flag.flagData?.what_happened) {
				// Handle both new array format and legacy string format
				const betterResponse = Array.isArray(flag.flagData.better_response)
					? flag.flagData.better_response.join(" | ")
					: flag.flagData.better_response;
				objectionPatterns.push({
					objectionType: flag.reason ?? "unknown",
					successfulResponse: betterResponse,
					frequency: 1,
				});
			}
		}

		// Aggregate by objection type
		const aggregated = this.aggregateByKey(objectionPatterns, "objectionType");

		await this.upsertContext(
			companyId,
			"objection_patterns",
			{
				patterns: aggregated,
			},
			highRatedFlags.length,
		);
	}

	/**
	 * Extract success patterns from top performers
	 */
	private static async extractSuccessPatterns(companyId: number, salespersonIds: number[]): Promise<void> {
		// Get flags with high ratings and coach notes (indicates manager approval)
		const topFlags = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), gte(schema.flags.repRating, 9)))
			.limit(200);

		const topPerformerTechniques: string[] = [];
		const winningStrategies: string[] = [];

		for (const row of topFlags) {
			const flag = row.flags;

			// Extract technique from better_response (handle both array and string formats)
			if (flag.flagData?.better_response) {
				const betterResponse = Array.isArray(flag.flagData.better_response)
					? flag.flagData.better_response.join(" | ")
					: flag.flagData.better_response;
				topPerformerTechniques.push(betterResponse);
			}

			// Extract strategy from coach notes
			if (flag.weeklyReviewStatus?.coachNotes) {
				winningStrategies.push(flag.weeklyReviewStatus.coachNotes);
			}
		}

		await this.upsertContext(
			companyId,
			"success_patterns",
			{
				topPerformerTechniques: topPerformerTechniques.slice(0, 30),
				winningStrategies: winningStrategies.slice(0, 20),
			},
			topFlags.length,
		);
	}

	/**
	 * Extract company-specific terminology
	 */
	private static async extractTerminology(companyId: number, salespersonIds: number[]): Promise<void> {
		// Get company training data if exists
		const companyData = await db
			.select()
			.from(schema.companyTrainingData)
			.where(eq(schema.companyTrainingData.companyId, companyId))
			.limit(1);

		const glossary: Record<string, string> = {};
		const productNames: string[] = [];

		if (companyData[0]) {
			const data = companyData[0];

			// Extract from product positioning
			if (data.productPositioning) {
				// Simple extraction - would use NLP in production
				const matches = data.productPositioning.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
				if (matches) {
					productNames.push(...matches);
				}
			}

			// Extract from onboarding document
			if (data.onboardingDocument) {
				const matches = data.onboardingDocument.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
				if (matches) {
					productNames.push(...matches.slice(0, 10)); // Limit to avoid too much noise
				}
			}
		}

		await this.upsertContext(
			companyId,
			"terminology",
			{
				glossary,
				productNames: [...new Set(productNames)], // Deduplicate
			},
			companyData.length,
		);
	}

	/**
	 * Extract anti-patterns from low-rated flags and bad reports
	 */
	private static async extractAntiPatterns(companyId: number, salespersonIds: number[]): Promise<void> {
		// Get low-rated flags (1-4)
		const lowRatedFlags = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(
				and(eq(schema.salespeople.companyId, companyId), sql`${schema.flags.repRating} IS NOT NULL AND ${schema.flags.repRating} <= 4`),
			)
			.limit(200);

		// Get bad flag reports
		const badFlags = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), sql`${schema.flags.badFlagReport} IS NOT NULL`))
			.limit(200);

		const avoidPatterns: Array<{ pattern: string; reason: string; frequency: number }> = [];

		// Extract from low-rated flags
		for (const row of lowRatedFlags) {
			const flag = row.flags;
			if (flag.flagData?.what_happened) {
				avoidPatterns.push({
					pattern: flag.flagData.what_happened,
					reason: `Low rating: ${flag.repRating}/10`,
					frequency: 1,
				});
			}
		}

		// Extract from bad flag reports
		for (const row of badFlags) {
			const flag = row.flags;
			if (flag.badFlagReport && typeof flag.badFlagReport === "object") {
				const report = flag.badFlagReport as { reason?: string; details?: string };
				if (report.details) {
					avoidPatterns.push({
						pattern: report.details,
						reason: report.reason ?? "reported-bad",
						frequency: 1,
					});
				}
			}
		}

		await this.upsertContext(
			companyId,
			"anti_patterns",
			{
				avoidPatterns: avoidPatterns.slice(0, 50),
			},
			lowRatedFlags.length + badFlags.length,
		);
	}

	/**
	 * Extract strategies from active battle cards (edited by managers)
	 */
	private static async extractBattleCardStrategies(companyId: number): Promise<void> {
		// Get all active battle cards for this company
		const battleCards = await db
			.select()
			.from(schema.battleCards)
			.where(and(eq(schema.battleCards.companyId, companyId), eq(schema.battleCards.isActive, true)))
			.orderBy(desc(schema.battleCards.frequency));

		const strategies: Array<{
			title: string;
			phase: string;
			challenge: string;
			strategy: string;
			approach: string[];
			script: string;
			frequency: number;
			successRate: number | null;
		}> = [];

		for (const card of battleCards) {
			strategies.push({
				title: card.title,
				phase: card.phase,
				challenge: card.challenge,
				strategy: card.strategy,
				approach: card.approach ?? [],
				script: card.script,
				frequency: card.frequency,
				successRate: card.successRate ? Number(card.successRate) : null,
			});
		}

		await this.upsertContext(
			companyId,
			"battle_card_strategies",
			{
				strategies: strategies.slice(0, 50),
				byPhase: {
					outreach: strategies.filter((s) => s.phase === "outreach").slice(0, 10),
					discovery: strategies.filter((s) => s.phase === "discovery").slice(0, 10),
					demo: strategies.filter((s) => s.phase === "demo").slice(0, 10),
					close: strategies.filter((s) => s.phase === "close").slice(0, 10),
				},
			},
			battleCards.length,
		);
	}

	/**
	 * Extract knowledge from onboarding documents and FAQ
	 */
	private static async extractOnboardingKnowledge(companyId: number): Promise<void> {
		const companyData = await db
			.select()
			.from(schema.companyTrainingData)
			.where(eq(schema.companyTrainingData.companyId, companyId))
			.limit(1);

		if (companyData.length === 0) {
			await this.upsertContext(companyId, "onboarding_knowledge", { available: false }, 0);
			return;
		}

		const data = companyData[0];

		await this.upsertContext(
			companyId,
			"onboarding_knowledge",
			{
				available: true,
				onboardingDocument: data.onboardingDocument ?? null,
				productPositioning: data.productPositioning ?? null,
				companyValues: data.companyValues ?? [],
				competitorInfo: data.competitorInfo ?? {},
				objectionHandlingGuide: data.objectionHandlingGuide ?? {},
			},
			1,
		);
	}

	/**
	 * Extract and aggregate all coach notes from flags
	 */
	private static async extractCoachNotes(companyId: number, salespersonIds: number[]): Promise<void> {
		// Get all flags with coach notes
		const flagsWithCoachNotes = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), sql`${schema.flags.weeklyReviewStatus}->>'coachNotes' IS NOT NULL`));

		// Get flags with manager reviews
		const flagsWithManagerReview = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), sql`${schema.flags.managerReview} IS NOT NULL`));

		const coachingInsights: Array<{
			flagReason: string | null;
			coachNotes: string;
			repRating: number | null;
		}> = [];

		const managerAdjustments: Array<{
			flagReason: string | null;
			isGoodFlag: boolean;
			managerNotes: string | null;
			adjustedBetterResponse: string | null;
		}> = [];

		for (const row of flagsWithCoachNotes) {
			const notes = (row.flags.weeklyReviewStatus as { coachNotes?: string } | null)?.coachNotes;
			if (notes) {
				coachingInsights.push({
					flagReason: row.flags.reason,
					coachNotes: notes,
					repRating: row.flags.repRating,
				});
			}
		}

		for (const row of flagsWithManagerReview) {
			const review = row.flags.managerReview as {
				isGoodFlag?: boolean;
				managerNotes?: string;
				adjustedBetterResponse?: string;
			} | null;
			if (review) {
				managerAdjustments.push({
					flagReason: row.flags.reason,
					isGoodFlag: review.isGoodFlag ?? false,
					managerNotes: review.managerNotes ?? null,
					adjustedBetterResponse: review.adjustedBetterResponse ?? null,
				});
			}
		}

		await this.upsertContext(
			companyId,
			"coach_notes",
			{
				coachingInsights: coachingInsights.slice(0, 100),
				managerAdjustments: managerAdjustments.slice(0, 100),
				goodFlagPatterns: managerAdjustments.filter((m) => m.isGoodFlag).slice(0, 30),
				badFlagPatterns: managerAdjustments.filter((m) => !m.isGoodFlag).slice(0, 30),
			},
			flagsWithCoachNotes.length + flagsWithManagerReview.length,
		);
	}

	/**
	 * Benchmark reps by skill scores - identify top and low performers
	 */
	private static async extractRepBenchmarks(companyId: number, salespersonIds: number[]): Promise<void> {
		if (salespersonIds.length === 0) {
			await this.upsertContext(companyId, "rep_benchmarks", { available: false }, 0);
			return;
		}

		// Get skill assessments for all salespeople in this company
		// Join through interactions to get salesperson
		const assessments = await db
			.select({
				assessment: schema.skillsAssessments,
				salespersonId: schema.interactions.salespersonId,
			})
			.from(schema.skillsAssessments)
			.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
			.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
			.where(eq(schema.salespeople.companyId, companyId));

		if (assessments.length === 0) {
			await this.upsertContext(companyId, "rep_benchmarks", { available: false }, 0);
			return;
		}

		// Calculate average scores per salesperson
		const repScores = new Map<
			number,
			{
				salespersonId: number;
				objectionHandling: number[];
				pricingDiscussions: number[];
				discoveryFeatures: number[];
				closing: number[];
			}
		>();

		for (const row of assessments) {
			const spId = row.salespersonId;
			if (!repScores.has(spId)) {
				repScores.set(spId, {
					salespersonId: spId,
					objectionHandling: [],
					pricingDiscussions: [],
					discoveryFeatures: [],
					closing: [],
				});
			}
			const scores = repScores.get(spId)!;
			scores.objectionHandling.push(row.assessment.objectionHandlingScore);
			scores.pricingDiscussions.push(row.assessment.pricingDiscussionsScore);
			scores.discoveryFeatures.push(row.assessment.discoveryFeaturesScore);
			scores.closing.push(row.assessment.closingScore);
		}

		// Calculate averages and overall score
		const repAverages = Array.from(repScores.values()).map((rep) => {
			const avgScore = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
			const objection = avgScore(rep.objectionHandling);
			const pricing = avgScore(rep.pricingDiscussions);
			const discovery = avgScore(rep.discoveryFeatures);
			const closing = avgScore(rep.closing);
			const overall = (objection + pricing + discovery + closing) / 4;

			return {
				salespersonId: rep.salespersonId,
				averageScores: {
					objectionHandling: Math.round(objection * 10) / 10,
					pricingDiscussions: Math.round(pricing * 10) / 10,
					discoveryFeatures: Math.round(discovery * 10) / 10,
					closing: Math.round(closing * 10) / 10,
				},
				overallScore: Math.round(overall * 10) / 10,
				assessmentCount: rep.objectionHandling.length,
			};
		});

		// Sort by overall score
		repAverages.sort((a, b) => b.overallScore - a.overallScore);

		// Top performers (top 25%) and low performers (bottom 25%)
		const topCount = Math.max(1, Math.floor(repAverages.length * 0.25));
		const topPerformers = repAverages.slice(0, topCount);
		const lowPerformers = repAverages.slice(-topCount);

		// Calculate company averages
		const allScores = repAverages.map((r) => r.overallScore);
		const companyAverage = allScores.reduce((a, b) => a + b, 0) / allScores.length;

		await this.upsertContext(
			companyId,
			"rep_benchmarks",
			{
				available: true,
				topPerformers,
				lowPerformers,
				companyAverages: {
					overall: Math.round(companyAverage * 10) / 10,
					objectionHandling:
						Math.round((repAverages.reduce((sum, r) => sum + r.averageScores.objectionHandling, 0) / repAverages.length) * 10) / 10,
					pricingDiscussions:
						Math.round((repAverages.reduce((sum, r) => sum + r.averageScores.pricingDiscussions, 0) / repAverages.length) * 10) / 10,
					discoveryFeatures:
						Math.round((repAverages.reduce((sum, r) => sum + r.averageScores.discoveryFeatures, 0) / repAverages.length) * 10) / 10,
					closing: Math.round((repAverages.reduce((sum, r) => sum + r.averageScores.closing, 0) / repAverages.length) * 10) / 10,
				},
				totalReps: repAverages.length,
			},
			assessments.length,
		);
	}

	/**
	 * Extract ideal responses from company training data
	 */
	private static async extractIdealResponses(companyId: number): Promise<void> {
		const companyData = await db
			.select()
			.from(schema.companyTrainingData)
			.where(eq(schema.companyTrainingData.companyId, companyId))
			.limit(1);

		if (companyData.length === 0 || !companyData[0].idealResponses) {
			await this.upsertContext(companyId, "ideal_responses", { available: false }, 0);
			return;
		}

		const idealResponses = companyData[0].idealResponses;
		const scenarios = Object.entries(idealResponses).map(([scenario, data]) => ({
			scenario,
			idealResponse: data.ideal_response,
			keyPoints: data.key_points,
		}));

		await this.upsertContext(
			companyId,
			"ideal_responses",
			{
				available: true,
				scenarios,
			},
			scenarios.length,
		);
	}

	/**
	 * Create labeled training examples from feedback data
	 */
	private static async createTrainingExamples(companyId: number, salespersonIds: number[]): Promise<void> {
		// Get all flags with feedback for this company
		const flagsWithFeedback = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.innerJoin(schema.interactions, eq(schema.flags.interactionId, schema.interactions.id))
			.where(
				and(
					eq(schema.salespeople.companyId, companyId),
					sql`${schema.flags.repRating} IS NOT NULL OR ${schema.flags.weeklyReviewStatus} IS NOT NULL OR ${schema.flags.badFlagReport} IS NOT NULL`,
				),
			)
			.limit(500);

		for (const row of flagsWithFeedback) {
			const flag = row.flags;
			const interaction = row.interactions;

			// Determine quality based on feedback
			const quality = this.determineQuality(flag);

			// Create training example for flag generation
			await db
				.insert(schema.trainingExamples)
				.values({
					companyId,
					exampleType: "flag_generation",
					inputData: {
						transcriptSegment: interaction.v1_raw_google_diarized,
						callMetadata: {
							duration: interaction.metadata,
							salespersonId: flag.associatedSalespersonId,
						},
					},
					expectedOutput: {
						flagType: flag.reason,
						reasoning: flag.flagData?.why_this_matters,
						betterResponse: flag.flagData?.better_response,
					},
					feedbackSignals: {
						repRating: flag.repRating,
						coachNotes: (flag.weeklyReviewStatus as { coachNotes?: string } | null)?.coachNotes,
						badFlagReport: flag.badFlagReport,
						managerReview: flag.managerReview,
					},
					quality,
					sourceFlagId: flag.id,
					sourceInteractionId: interaction.id,
				})
				.onConflictDoNothing();
		}

		logger.info({ companyId, count: flagsWithFeedback.length }, "Created training examples");
	}

	/**
	 * Determine quality score based on feedback signals
	 */
	private static determineQuality(flag: typeof schema.flags.$inferSelect): "high" | "medium" | "low" {
		// High quality: high rep rating (8-10) AND coach notes or manager approval
		if (flag.repRating && flag.repRating >= 8) {
			if (flag.weeklyReviewStatus || flag.managerReview) {
				return "high";
			}
			return "medium";
		}

		// Low quality: low rating (1-4) OR bad flag report
		if ((flag.repRating && flag.repRating <= 4) || flag.badFlagReport) {
			return "low";
		}

		// Medium quality: everything else
		return "medium";
	}

	/**
	 * Upsert context data for a company
	 */
	private static async upsertContext(
		companyId: number,
		contextType:
			| "sales_language"
			| "objection_patterns"
			| "success_patterns"
			| "terminology"
			| "anti_patterns"
			| "battle_card_strategies"
			| "onboarding_knowledge"
			| "coach_notes"
			| "rep_benchmarks"
			| "ideal_responses"
			| "flag_quality_patterns"
			| "better_responses"
			| "battle_card_improvements"
			| "top_performer_patterns"
			| "bottom_performer_patterns"
			| "skill_gap_patterns",
		data: unknown,
		sampleSize: number,
	): Promise<void> {
		// Calculate confidence based on sample size
		const confidence = Math.min(sampleSize / 100, 1.0); // Max confidence at 100+ samples

		// Check if context exists
		const existing = await db
			.select()
			.from(schema.companyAiContext)
			.where(and(eq(schema.companyAiContext.companyId, companyId), eq(schema.companyAiContext.contextType, contextType)))
			.limit(1);

		if (existing.length > 0) {
			// Update existing
			await db
				.update(schema.companyAiContext)
				.set({
					data: data as object,
					confidence: confidence.toFixed(4),
					sampleSize,
					lastUpdated: new Date(),
				})
				.where(eq(schema.companyAiContext.id, existing[0].id));
		} else {
			// Insert new
			await db.insert(schema.companyAiContext).values({
				companyId,
				contextType,
				data: data as object,
				confidence: confidence.toFixed(4),
				sampleSize,
				version: "1.0",
			});
		}

		logger.debug({ companyId, contextType, sampleSize, confidence: confidence.toFixed(2) }, "Updated AI context");
	}

	/**
	 * Utility: Count frequency of items
	 */
	private static countFrequency(items: string[]): Record<string, number> {
		const frequency: Record<string, number> = {};
		for (const item of items) {
			frequency[item] = (frequency[item] ?? 0) + 1;
		}
		return frequency;
	}

	/**
	 * Utility: Aggregate objects by key
	 */
	private static aggregateByKey<T extends Record<string, unknown>>(items: T[], key: keyof T): T[] {
		const grouped = new Map<unknown, T[]>();

		for (const item of items) {
			const keyValue = item[key];
			const existing = grouped.get(keyValue) ?? [];
			existing.push(item);
			grouped.set(keyValue, existing);
		}

		// Merge items with same key
		const result: T[] = [];
		for (const [_, items] of grouped) {
			if (items.length > 0) {
				const merged = { ...items[0] } as T & { frequency?: number };
				if ("frequency" in merged && typeof merged.frequency === "number") {
					(merged as { frequency: number }).frequency = items.length;
				}
				result.push(merged as T);
			}
		}

		return result;
	}

	/**
	 * Process feedbackEvents table to extract learned patterns
	 * This is the central learning loop for all human feedback
	 */
	static async processFeedbackEvents(companyId: number): Promise<void> {
		logger.debug({ companyId }, "Processing feedback events");

		// Get unprocessed feedback events
		const events = await db
			.select()
			.from(schema.feedbackEvents)
			.where(and(eq(schema.feedbackEvents.companyId, companyId), sql`${schema.feedbackEvents.processedAt} IS NULL`))
			.orderBy(asc(schema.feedbackEvents.createdAt))
			.limit(500);

		if (events.length === 0) {
			logger.debug({ companyId }, "No unprocessed feedback events");
			return;
		}

		// Group events by type
		const eventsByType = new Map<string, (typeof events)[0][]>();
		for (const event of events) {
			const existing = eventsByType.get(event.eventType) ?? [];
			existing.push(event);
			eventsByType.set(event.eventType, existing);
		}

		// Process each event type
		const flagRatings = eventsByType.get("flag_rating") ?? [];
		const badReports = eventsByType.get("flag_bad_report") ?? [];
		const coachNotes = eventsByType.get("coach_notes") ?? [];
		const battleCardEdits = eventsByType.get("battle_card_edit") ?? [];

		// Extract flag quality patterns from ratings and bad reports
		if (flagRatings.length > 0 || badReports.length > 0) {
			await this.extractFlagQualityPatterns(companyId, flagRatings, badReports);
		}

		// Extract better responses from coach notes
		if (coachNotes.length > 0) {
			await this.extractBetterResponses(companyId, coachNotes);
		}

		// Extract battle card improvements from edits
		if (battleCardEdits.length > 0) {
			await this.extractBattleCardImprovements(companyId, battleCardEdits);
		}

		// Mark all events as processed
		const eventIds = events.map((e) => e.id);
		await db
			.update(schema.feedbackEvents)
			.set({ processedAt: new Date() })
			.where(
				sql`${schema.feedbackEvents.id} IN (${sql.join(
					eventIds.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

		logger.info({ companyId, count: events.length }, "Processed feedback events");
	}

	/**
	 * Extract patterns about what makes flags good vs bad
	 */
	private static async extractFlagQualityPatterns(
		companyId: number,
		ratings: (typeof schema.feedbackEvents.$inferSelect)[],
		badReports: (typeof schema.feedbackEvents.$inferSelect)[],
	): Promise<void> {
		const goodFlagPatterns: Array<{ flagType: string; rating: number; context: unknown }> = [];
		const badFlagPatterns: Array<{ flagType: string; reason: string; context: unknown }> = [];

		for (const rating of ratings) {
			const data = rating.data as { rating?: number; flagType?: string } | null;
			if (data?.rating && data.rating >= 8) {
				goodFlagPatterns.push({
					flagType: data.flagType ?? "unknown",
					rating: data.rating,
					context: rating.context,
				});
			}
		}

		for (const report of badReports) {
			const data = report.data as { reason?: string; flagType?: string } | null;
			badFlagPatterns.push({
				flagType: data?.flagType ?? "unknown",
				reason: data?.reason ?? "unspecified",
				context: report.context,
			});
		}

		await this.upsertContext(
			companyId,
			"flag_quality_patterns" as Parameters<typeof this.upsertContext>[1],
			{
				goodFlagPatterns: goodFlagPatterns.slice(0, 100),
				badFlagPatterns: badFlagPatterns.slice(0, 100),
				summary: {
					totalGoodFlags: goodFlagPatterns.length,
					totalBadFlags: badFlagPatterns.length,
					commonGoodTypes: this.countFrequency(goodFlagPatterns.map((p) => p.flagType)),
					commonBadTypes: this.countFrequency(badFlagPatterns.map((p) => p.flagType)),
				},
			},
			ratings.length + badReports.length,
		);
	}

	/**
	 * Extract better response patterns from coach notes
	 */
	private static async extractBetterResponses(companyId: number, coachNotes: (typeof schema.feedbackEvents.$inferSelect)[]): Promise<void> {
		const responses: Array<{
			situation: string;
			originalResponse: string;
			betterResponse: string;
			coachReasoning: string;
		}> = [];

		for (const note of coachNotes) {
			const data = note.data as {
				situation?: string;
				originalResponse?: string;
				betterResponse?: string;
				reasoning?: string;
			} | null;

			if (data?.betterResponse) {
				responses.push({
					situation: data.situation ?? "unspecified",
					originalResponse: data.originalResponse ?? "",
					betterResponse: data.betterResponse,
					coachReasoning: data.reasoning ?? "",
				});
			}
		}

		await this.upsertContext(
			companyId,
			"better_responses" as Parameters<typeof this.upsertContext>[1],
			{
				responses: responses.slice(0, 100),
				count: responses.length,
			},
			coachNotes.length,
		);
	}

	/**
	 * Extract improvements from battle card edits
	 */
	private static async extractBattleCardImprovements(
		companyId: number,
		edits: (typeof schema.feedbackEvents.$inferSelect)[],
	): Promise<void> {
		const improvements: Array<{
			battleCardTitle: string;
			fieldChanged: string;
			originalValue: string;
			newValue: string;
		}> = [];

		for (const edit of edits) {
			const data = edit.data as {
				battleCardTitle?: string;
				fieldChanged?: string;
				originalValue?: string;
				newValue?: string;
			} | null;

			if (data?.fieldChanged && data?.newValue) {
				improvements.push({
					battleCardTitle: data.battleCardTitle ?? "unknown",
					fieldChanged: data.fieldChanged,
					originalValue: data.originalValue ?? "",
					newValue: data.newValue,
				});
			}
		}

		await this.upsertContext(
			companyId,
			"battle_card_improvements" as Parameters<typeof this.upsertContext>[1],
			{
				improvements: improvements.slice(0, 100),
				commonEdits: this.countFrequency(improvements.map((i) => i.fieldChanged)),
				count: improvements.length,
			},
			edits.length,
		);
	}

	/**
	 * Extract patterns from top performers (top 25% by skill scores)
	 * What do they do differently in calls?
	 */
	static async extractTopPerformerPatterns(companyId: number): Promise<void> {
		logger.debug({ companyId }, "Extracting top performer patterns");

		// Get salespeople with their average scores
		const salespeople = await db.select().from(schema.salespeople).where(eq(schema.salespeople.companyId, companyId));

		if (salespeople.length === 0) return;

		// Get all skill assessments for this company
		const assessments = await db
			.select({
				assessment: schema.skillsAssessments,
				salespersonId: schema.interactions.salespersonId,
				interactionId: schema.interactions.id,
			})
			.from(schema.skillsAssessments)
			.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
			.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
			.where(eq(schema.salespeople.companyId, companyId));

		// Calculate average score per salesperson
		const repScores = new Map<number, number[]>();
		for (const row of assessments) {
			const avg =
				(row.assessment.objectionHandlingScore +
					row.assessment.pricingDiscussionsScore +
					row.assessment.discoveryFeaturesScore +
					row.assessment.closingScore) /
				4;
			const existing = repScores.get(row.salespersonId) ?? [];
			existing.push(avg);
			repScores.set(row.salespersonId, existing);
		}

		const repAverages = Array.from(repScores.entries())
			.map(([spId, scores]) => ({
				salespersonId: spId,
				avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
			}))
			.sort((a, b) => b.avgScore - a.avgScore);

		const topCount = Math.max(1, Math.floor(repAverages.length * 0.25));
		const topPerformerIds = repAverages.slice(0, topCount).map((r) => r.salespersonId);

		// Get high-rated flags from top performers
		const topPerformerFlags = await db
			.select()
			.from(schema.flags)
			.where(
				and(
					sql`${schema.flags.associatedSalespersonId} IN (${sql.join(
						topPerformerIds.map((id) => sql`${id}`),
						sql`, `,
					)})`,
					gte(schema.flags.repRating, 8),
				),
			)
			.limit(200);

		// Extract patterns from their successful interactions
		const successPatterns: Array<{
			skill: string;
			technique: string;
			example: string;
		}> = [];

		for (const flag of topPerformerFlags) {
			if (flag.flagData?.better_response) {
				const betterResponse = Array.isArray(flag.flagData.better_response)
					? flag.flagData.better_response.join(" | ")
					: flag.flagData.better_response;
				successPatterns.push({
					skill: flag.reason ?? "general",
					technique: flag.flagData.what_happened ?? "unspecified",
					example: betterResponse,
				});
			}
		}

		await this.upsertContext(
			companyId,
			"top_performer_patterns" as Parameters<typeof this.upsertContext>[1],
			{
				topPerformerIds,
				avgScoreThreshold: repAverages[topCount - 1]?.avgScore ?? 0,
				successPatterns: successPatterns.slice(0, 50),
				commonSkills: this.countFrequency(successPatterns.map((p) => p.skill)),
			},
			topPerformerFlags.length,
		);

		logger.debug({ companyId, count: successPatterns.length }, "Extracted top performer patterns");
	}

	/**
	 * Extract patterns from bottom performers (bottom 25% by skill scores)
	 * What mistakes do they commonly make?
	 */
	static async extractBottomPerformerPatterns(companyId: number): Promise<void> {
		logger.debug({ companyId }, "Extracting bottom performer patterns");

		// Get salespeople with their average scores (same calculation as top performers)
		const salespeople = await db.select().from(schema.salespeople).where(eq(schema.salespeople.companyId, companyId));

		if (salespeople.length === 0) return;

		const assessments = await db
			.select({
				assessment: schema.skillsAssessments,
				salespersonId: schema.interactions.salespersonId,
			})
			.from(schema.skillsAssessments)
			.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
			.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
			.where(eq(schema.salespeople.companyId, companyId));

		const repScores = new Map<number, number[]>();
		for (const row of assessments) {
			const avg =
				(row.assessment.objectionHandlingScore +
					row.assessment.pricingDiscussionsScore +
					row.assessment.discoveryFeaturesScore +
					row.assessment.closingScore) /
				4;
			const existing = repScores.get(row.salespersonId) ?? [];
			existing.push(avg);
			repScores.set(row.salespersonId, existing);
		}

		const repAverages = Array.from(repScores.entries())
			.map(([spId, scores]) => ({
				salespersonId: spId,
				avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
			}))
			.sort((a, b) => a.avgScore - b.avgScore); // Sort ascending for bottom performers

		const bottomCount = Math.max(1, Math.floor(repAverages.length * 0.25));
		const bottomPerformerIds = repAverages.slice(0, bottomCount).map((r) => r.salespersonId);

		// Get flags from bottom performers (both low-rated and all flags to see mistakes)
		const bottomPerformerFlags = await db
			.select()
			.from(schema.flags)
			.where(
				sql`${schema.flags.associatedSalespersonId} IN (${sql.join(
					bottomPerformerIds.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			)
			.limit(200);

		// Extract common mistake patterns
		const mistakePatterns: Array<{
			skill: string;
			mistake: string;
			frequency: number;
		}> = [];

		const mistakeCounts = new Map<string, number>();
		for (const flag of bottomPerformerFlags) {
			const key = `${flag.reason ?? "unknown"}:${flag.flagData?.what_happened ?? "unspecified"}`;
			mistakeCounts.set(key, (mistakeCounts.get(key) ?? 0) + 1);
		}

		for (const [key, count] of mistakeCounts) {
			const [skill, mistake] = key.split(":");
			mistakePatterns.push({
				skill,
				mistake,
				frequency: count,
			});
		}

		mistakePatterns.sort((a, b) => b.frequency - a.frequency);

		await this.upsertContext(
			companyId,
			"bottom_performer_patterns" as Parameters<typeof this.upsertContext>[1],
			{
				bottomPerformerIds,
				avgScoreThreshold: repAverages[bottomCount - 1]?.avgScore ?? 0,
				commonMistakes: mistakePatterns.slice(0, 30),
				skillsToImprove: this.countFrequency(bottomPerformerFlags.map((f) => f.reason ?? "unknown")),
			},
			bottomPerformerFlags.length,
		);

		logger.debug({ companyId, count: mistakePatterns.length }, "Extracted bottom performer patterns");
	}

	/**
	 * Extract skill gaps across the entire team
	 * Identifies which skills need the most improvement company-wide
	 */
	static async extractSkillGapPatterns(companyId: number): Promise<void> {
		logger.debug({ companyId }, "Extracting skill gap patterns");

		// Get all skill assessments for this company
		const assessments = await db
			.select({
				assessment: schema.skillsAssessments,
			})
			.from(schema.skillsAssessments)
			.innerJoin(schema.interactions, eq(schema.skillsAssessments.interactionId, schema.interactions.id))
			.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
			.where(eq(schema.salespeople.companyId, companyId));

		if (assessments.length === 0) {
			await this.upsertContext(companyId, "skill_gap_patterns" as Parameters<typeof this.upsertContext>[1], { available: false }, 0);
			return;
		}

		// Calculate average scores per skill
		const skillScores = {
			objectionHandling: [] as number[],
			pricingDiscussions: [] as number[],
			discoveryFeatures: [] as number[],
			closing: [] as number[],
		};

		for (const row of assessments) {
			skillScores.objectionHandling.push(row.assessment.objectionHandlingScore);
			skillScores.pricingDiscussions.push(row.assessment.pricingDiscussionsScore);
			skillScores.discoveryFeatures.push(row.assessment.discoveryFeaturesScore);
			skillScores.closing.push(row.assessment.closingScore);
		}

		const avgScore = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
		const skillAverages = {
			objectionHandling: avgScore(skillScores.objectionHandling),
			pricingDiscussions: avgScore(skillScores.pricingDiscussions),
			discoveryFeatures: avgScore(skillScores.discoveryFeatures),
			closing: avgScore(skillScores.closing),
		};

		// Sort by average to identify weakest skills
		const sortedSkills = Object.entries(skillAverages)
			.map(([skill, avg]) => ({ skill, avg: Math.round(avg * 10) / 10 }))
			.sort((a, b) => a.avg - b.avg);

		// Get flags for the weakest skills to understand specific gaps
		const weakestSkill = sortedSkills[0]?.skill;
		const relatedFlags = await db
			.select()
			.from(schema.flags)
			.innerJoin(schema.salespeople, eq(schema.flags.associatedSalespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), sql`${schema.flags.reason} ILIKE '%' || ${weakestSkill} || '%'`))
			.limit(50);

		const specificGaps: string[] = [];
		for (const row of relatedFlags) {
			if (row.flags.flagData?.what_happened) {
				specificGaps.push(row.flags.flagData.what_happened);
			}
		}

		await this.upsertContext(
			companyId,
			"skill_gap_patterns" as Parameters<typeof this.upsertContext>[1],
			{
				available: true,
				skillRankings: sortedSkills,
				weakestSkill,
				strongestSkill: sortedSkills[sortedSkills.length - 1]?.skill,
				specificGaps: specificGaps.slice(0, 20),
				recommendedFocus: sortedSkills.slice(0, 2).map((s) => s.skill),
			},
			assessments.length,
		);

		logger.debug({ companyId, weakestSkill }, "Extracted skill gap patterns");
	}

	/**
	 * Run aggregation for all companies
	 */
	static async aggregateAllCompanies(): Promise<void> {
		const companies = await db.select().from(schema.companies);

		logger.info({ count: companies.length }, "Starting aggregation for all companies");

		for (const company of companies) {
			try {
				await this.aggregateCompanyFeedback(company.id);
			} catch (error) {
				logger.error({ error, companyId: company.id }, "Error aggregating company feedback");
			}
		}

		logger.info("Completed aggregation for all companies");
	}
}
