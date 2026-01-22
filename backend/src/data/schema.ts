import { pgTable, text, timestamp, integer, pgEnum, unique, boolean, decimal, jsonb } from "drizzle-orm/pg-core";
import type { TranscriptionResult } from "#/services/AudioTranscriptionService";
import type { InteractionMetadata } from "./types";

// Note: RLS (Row Level Security) has been disabled in favor of application-level authorization
// All authorization checks are handled in middleware and route handlers
// This provides more flexibility and easier debugging while maintaining security

// Re-export shared types for convenience
export type { InteractionMetadata };

export const ratingTypes = pgEnum("rating_types", ["ollama", "human"]);

export const processedStatus = pgEnum("processed_status", ["unprocessed", "processing", "processed", "failed"]);

export const userRoles = pgEnum("user_roles", ["admin", "user"]);

export const companyRoles = pgEnum("company_roles", ["admin", "salesperson"]);

export const promptSettingKeys = pgEnum("prompt_setting_keys", [
	// Analysis prompts (run on transcript with caching)
	"rating", // 1st call - cache write
	"flagging", // 2nd call - cache hit
	"extraction", // 3rd call - includes battle cards, cache hit
	"call_persona", // 4th call - extracts persona from EVERY call, cache hit
	// Training/roleplay prompts (use pre-extracted data, NOT transcript)
	"training_flag", // Uses exact persona from call_persona for that call
	"training_skills", // Uses synthesized personas from call_personas library
	"training_battle_card", // Uses synthesized personas + battle cards
	"training_roleplay", // 5th call - generates ElevenLabs roleplay persona from transcript context
	// Legacy keys (kept for backwards compatibility)
	"training_scenario",
	"combined_analysis",
	"metadata",
	"battle_card",
	"flag_persona", // Renamed to call_persona
]);

export const aiContextTypes = pgEnum("ai_context_types", [
	"sales_language",
	"objection_patterns",
	"success_patterns",
	"terminology",
	"anti_patterns",
	"battle_card_strategies",
	"onboarding_knowledge",
	"coach_notes",
	"rep_benchmarks",
	"ideal_responses",
	// Feedback-learned patterns
	"flag_quality_patterns",
	"better_responses",
	"battle_card_improvements",
	// Performer-based patterns
	"top_performer_patterns",
	"bottom_performer_patterns",
	"skill_gap_patterns",
]);

export const trainingExampleTypes = pgEnum("training_example_types", [
	"flag_generation",
	"roleplay_scenario",
	"response_quality",
	"insight_generation",
]);

export const trainingQuality = pgEnum("training_quality", ["high", "medium", "low"]);

// Feedback event types - for tracking all human feedback that AI should learn from
export const feedbackEventTypes = pgEnum("feedback_event_types", [
	"flag_rating", // Rep rated a flag (1-10)
	"flag_bad_report", // Rep reported flag as bad/unhelpful
	"flag_manager_review", // Manager approved/rejected/adjusted flag
	"coach_notes", // Coach added notes on what to say better
	"battle_card_edit", // Human edited AI-generated battle card
	"objection_response", // Feedback on objection handling
]);

// Central table for ALL human feedback that AI should learn from
export const feedbackEvents = pgTable(
	"feedback_events",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		companyId: integer("company_id").notNull(),
		userId: text("user_id"), // Who gave the feedback (if known)
		salespersonId: integer("salesperson_id"), // Which salesperson the feedback relates to

		// Type of feedback event
		eventType: feedbackEventTypes("event_type").notNull(),

		// Source reference - what triggered this feedback
		sourceType: text("source_type").notNull(), // "flag", "battle_card", "interaction", "training"
		sourceId: integer("source_id"), // ID of the source object
		interactionId: integer("interaction_id"), // Optional: which call this relates to

		// The actual feedback data (varies by eventType)
		// flag_rating: { rating: 1-10, flagType: string }
		// flag_bad_report: { reason: string, details: string, flagType: string }
		// coach_notes: { situation: string, originalResponse: string, betterResponse: string, reasoning: string }
		// battle_card_edit: { battleCardTitle: string, fieldChanged: string, originalValue: string, newValue: string }
		data: jsonb("data").notNull(),

		// Context about when/where this feedback occurred
		// e.g., transcriptSnippet, salesPhase, objectionType, etc.
		context: jsonb("context"),

		// Processing status
		processedAt: timestamp("processed_at"), // When this was processed into learned patterns
		processedIntoContextId: integer("processed_into_context_id"), // Which companyAiContext was updated

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(_t) => [],
);

// Audit log for tracking sensitive data access
export const auditLogs = pgTable(
	"audit_logs",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id"), // Who performed the action (null for system actions)
		action: text("action").notNull(), // e.g., "read", "update", "delete", "export"
		resourceType: text("resource_type").notNull(), // e.g., "interaction", "flag", "salesperson"
		resourceId: integer("resource_id"), // ID of the resource accessed
		companyId: integer("company_id"), // Which company's data was accessed
		details: jsonb("details"), // Additional context (e.g., query params, fields accessed)
		ipAddress: text("ip_address"), // Client IP for security tracking
		userAgent: text("user_agent"), // Browser/client info
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(_t) => [],
);

// Site-wide roles
export const authUserRoles = pgTable(
	"auth_user_roles",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: userRoles("role").notNull(),
	},
	(_t) => [],
);

export const salespeople = pgTable(
	"salespeople",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		firstName: text("first_name").notNull(),
		lastName: text("last_name").notNull(),
		avatar: text("avatar"),
		// email: text("email").notNull(),

		createdAt: timestamp("created_at").defaultNow(),

		// Refs
		companyId: integer("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),
		associatedUserId: text("associated_user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
	},
	(_t) => [],
);

export const companies = pgTable(
	"company",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		name: text("name").notNull(),

		createdAt: timestamp("created_at").defaultNow(),

		revenueGoal: decimal("monthly_revenue_goal", { precision: 10, scale: 2 }),
	},
	(_t) => [],
);

export const companyUserRoles = pgTable(
	"company_user_roles",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		companyId: integer("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: companyRoles("role").notNull(),
	},
	(t) => [unique().on(t.companyId, t.userId)],
);

export const companyTrainingData = pgTable(
	"company_training_data",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		companyId: integer("company_id")
			.notNull()
			.unique()
			.references(() => companies.id, { onDelete: "cascade" }),

		// Onboarding documentation - company overview, values, mission
		onboardingDocument: text("onboarding_document"),

		// Ideal responses for common scenarios
		// Structure: { [scenario: string]: { ideal_response: string, key_points: string[] } }
		idealResponses: jsonb("ideal_responses").$type<Record<string, { ideal_response: string; key_points: string[] }>>(),

		// Objection handling guide
		// Structure: { [objection: string]: { response_strategy: string, examples: string[] } }
		objectionHandlingGuide: jsonb("objection_handling_guide").$type<Record<string, { response_strategy: string; examples: string[] }>>(),

		// Product positioning and messaging
		productPositioning: text("product_positioning"),

		// Competitor information
		// Structure: { [competitor: string]: { strengths: string[], weaknesses: string[], positioning: string } }
		competitorInfo: jsonb("competitor_info").$type<Record<string, { strengths: string[]; weaknesses: string[]; positioning: string }>>(),

		// Company values and culture
		companyValues: jsonb("company_values").$type<string[]>(),

		// Target customer profile
		targetCustomerProfile: text("target_customer_profile"),

		// Sales methodology (e.g., MEDDIC, SPIN, Challenger)
		salesMethodology: text("sales_methodology"),

		// Example call transcripts for company-specific training
		exampleGoodCall: text("example_good_call"),
		exampleBadCall: text("example_bad_call"),
		exampleAverageCall: text("example_average_call"),

		// Company FAQ - comprehensive FAQ document that can be pasted from Word/other sources
		companyFaq: text("company_faq"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(_t) => [],
);

export const interactions = pgTable(
	"interactions",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		blurb: text("blurb").notNull(),
		// rawInteractionText has been removed - use computeRawInteractionText() from data/index.ts instead

		// Processing status tracking
		processedStatus: processedStatus("processed_status").notNull().default("unprocessed"),
		processedAt: timestamp("processed_at"),
		v1_raw_google_diarized: jsonb("v1_raw_google_diarized").$type<TranscriptionResult>(),

		// Notes field for storing structured metadata
		// Structure: { [key: string]: object }
		// Example: { flagging: { mastra: { raw: string, scratchpad: string } } }
		notes: jsonb("notes").$type<{
			[key: string]: {
				[subKey: string]: unknown;
			};
		}>(),

		// Extracted metadata from the interaction (prospect info, etc.)
		metadata: jsonb("metadata").$type<InteractionMetadata>(),

		createdAt: timestamp("created_at").defaultNow(),

		//refs
		salespersonId: integer("salesperson_id")
			.notNull()
			.references(() => salespeople.id, { onDelete: "cascade" }),
	},
	(_t) => [],
);

export const ratings = pgTable(
	"ratings",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		type: ratingTypes("type").notNull(),
		value: integer("value").notNull(),

		createdAt: timestamp("created_at").defaultNow(),
		blurb: text("blurb").notNull(),

		// Refs
		interactionId: integer("interaction_id")
			.notNull()
			.references(() => interactions.id, { onDelete: "cascade" }),
	},
	(_t) => [],
);

export const skillsAssessments = pgTable(
	"skills_assessments",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),

		// Individual skill scores (1-10)
		objectionHandlingScore: integer("objection_handling_score").notNull(),
		pricingDiscussionsScore: integer("pricing_discussions_score").notNull(),
		discoveryFeaturesScore: integer("discovery_features_score").notNull(),
		closingScore: integer("closing_score").notNull(),

		// Full assessment data (JSONB) - includes skills, context, and summary
		assessmentData: jsonb("assessment_data")
			.$type<{
				skills: {
					objection_handling: {
						score: number | "N/A";
						evidence: string;
						missed_opportunity: string | null;
					};
					pricing_discussions: {
						score: number | "N/A";
						evidence: string;
						missed_opportunity: string | null;
					};
					discovery_needs_analysis: {
						score: number | "N/A";
						evidence: string;
						missed_opportunity: string | null;
					};
					closing_next_steps: {
						score: number | "N/A";
						evidence: string;
						missed_opportunity: string | null;
					};
				};
				call_context: {
					inferred_call_type: "discovery" | "demo" | "negotiation" | "closing" | "follow-up";
					call_stage: "early" | "mid" | "late";
					primary_objective: string;
				};
				red_flags: string[];
				top_strength: string;
				priority_improvement: string;
			}>()
			.notNull(),

		createdAt: timestamp("created_at").defaultNow(),

		// Refs
		interactionId: integer("interaction_id")
			.notNull()
			.references(() => interactions.id, { onDelete: "cascade" }),
	},
	(t) => [
		// Unique constraint - each interaction should only have one skills assessment
		unique("skills_assessments_interaction_id_unique").on(t.interactionId),
		// Index for date-based queries (trend analysis)
		{
			name: "skills_assessments_created_at_idx",
			columns: [t.createdAt],
		},
	],
);

// =============================================================================
// FLAGS TABLE (from Flagging Analysis - 2nd in pipeline)
// =============================================================================
// FLAGS are coaching moments generated by the FLAGGING agent (not extraction).
// They represent specific moments where the rep could improve, with:
// - what_happened: Description of the issue
// - better_response: Suggested alternatives
// - revenue_impact: Business impact of the mistake
// - timestamps: For video/audio playback
//
// SEPARATE from extraction tables - flags are actionable coaching items,
// while extraction tables store raw data (objections, pain points, highlights).
//
// FLAGS also support:
// - ElevenLabs training agents (agentId, agentPrompt)
// - Rep feedback (repRating, badFlagReport)
// - Manager review workflow (managerReview, weeklyReviewStatus)
// - Training sessions (trainingSession)
export const flags = pgTable(
	"flags",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),

		// Structured flag data stored as JSON
		flagData: jsonb("flag_data").$type<{
			revision: "v1";
			flag_title: string;
			confidenceOutOf100: number;
			validation_checklist: string[];
			what_happened: string;
			revenue_impact: string;
			// New format: array of response strings. Legacy: single string with "Option 1:" format
			better_response: string | string[];
			benchmarking_context: string;
			pattern_analysis?: string;
			role_expectation: string;
			why_this_matters: string;
			timestamps: { start?: string; end?: string };
			// Relevant conversation lines from the flagged moment
			transcript_segment?: string[];
			scratchpad?: string;
		}>(),

		// Legacy fields (keeping for backwards compatibility)
		reason: text("reason"),
		source: ratingTypes("source").notNull(),
		complete: boolean("complete").notNull().default(false),

		// ElevenLabs conversational AI agent ID for training sessions
		agentId: text("agent_id"),

		// Training prompt data - stores the systemPrompt, firstMessage, and metadata used to create the agent
		// Structure: { systemPrompt: string, firstMessage: string, voiceId?, model?, metadata?: PersonaMetadata }
		agentPrompt: jsonb("agent_prompt").$type<{
			systemPrompt: string;
			firstMessage: string;
			voiceId?: string;
			model?: string;
			metadata?: {
				prospect: {
					name: string;
					role: string;
					company: string;
					industry: string;
					skillPracticed?: string;
				};
				flagMoment?: {
					issueType: string;
					whatCustomerSaid: string;
					whatWentWrong: string;
				};
				voiceCharacteristics?: {
					tone?: string;
					pace?: string;
					energy?: string;
					fillerWords?: string[];
				};
			};
		}>(),

		// Rep rating (1-10 scale) - how helpful the rep found this flag
		repRating: integer("rep_rating"),

		// Manager review data - tracks manager adjustments and approval
		managerReview: jsonb("manager_review").$type<{
			approved: boolean;
			managerNotes?: string;
			adjustedBetterResponse?: string;
			adjustedWhyMatters?: string;
			isGoodFlag: boolean; // Manager's assessment of flag quality
			reviewedBy: string; // userId
			reviewedAt: string; // ISO timestamp
		}>(),

		// Bad flag report - when reps report a flag as incorrect/bad
		badFlagReport: jsonb("bad_flag_report").$type<{
			reportedBy: string; // userId
			reportedAt: string; // ISO timestamp
			reason: "incorrect-flag" | "outdated-technique" | "poor-scoring" | "wrong-context" | "technical-issue" | "other";
			details: string; // Rep's explanation
			status: "pending" | "resolved-agree" | "resolved-disagree";
			managerResponse?: string;
			managerAction?: "agree" | "disagree";
			respondedAt?: string;
		}>(),

		// Weekly manager review tracking
		weeklyReviewStatus: jsonb("weekly_review_status").$type<{
			weekAssigned: string; // ISO week format: "2024-W35"
			assignedAt: string; // ISO timestamp
			reviewedAt?: string; // ISO timestamp when manager reviewed
			coachNotes?: string; // Manager's coaching notes for this flag
		}>(),

		// Training session data - stored when training is completed
		trainingSession: jsonb("training_session").$type<{
			conversationId?: string; // ElevenLabs conversation ID
			score?: number; // Overall score 0-10
			duration?: number; // Duration in seconds
			completedAt?: string; // ISO timestamp when completed
		}>(),

		createdAt: timestamp("created_at").defaultNow(),
		// Refs
		interactionId: integer("interaction_id").references(() => interactions.id, {
			onDelete: "cascade",
		}),
		associatedSalespersonId: integer("associated_salesperson_id")
			.notNull()
			.references(() => salespeople.id, { onDelete: "cascade" }),
	},
	(_t) => [],
);

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified")
		.$defaultFn(() => false)
		.notNull(),
	image: text("image"),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const revenue = pgTable("revenues", {
	id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
	amount: decimal("amount", { precision: 100, scale: 2 }).notNull(),

	associatedSalespersonId: integer("associated_salesperson_id")
		.notNull()
		.references(() => salespeople.id, { onDelete: "cascade" }),

	closedAt: timestamp("closed_at").notNull(),
});

export const bigfiles = pgTable(
	"bigfiles",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		fileName: text("file_name").notNull(),
		filePath: text("file_path").notNull(), // S3 path, not presigned URL
		fileSize: integer("file_size"),
		mimeType: text("mime_type"),
		uploadedAt: timestamp("uploaded_at").defaultNow(),

		createdAt: timestamp("created_at").defaultNow(),

		// Optional: association with interactions for file uploads
		// Set to null on delete to preserve S3 files even when interaction is deleted
		interactionId: integer("interaction_id").references(() => interactions.id, { onDelete: "set null" }),

		// For video files: ID of the extracted audio file (null for non-video files)
		// Set to null on delete to keep video even if extracted audio is deleted
		extractedAudioFileId: integer("extracted_audio_file_id"),

		// Video metadata (only for video files)
		videoMetadata: jsonb("video_metadata").$type<{
			duration?: number; // in seconds
			width?: number;
			height?: number;
			codec?: string;
			bitrate?: number;
		}>(),
	},
	(_t) => [],
);

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()),
	updatedAt: timestamp("updated_at").$defaultFn(() => /* @__PURE__ */ new Date()),
});

// Notifications
export const notificationType = pgEnum("notification_type", ["info", "warning", "error", "success"]);
export const notificationStatus = pgEnum("notification_status", ["unread", "read", "dismissed"]);

export const notifications = pgTable(
	"notifications",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		message: text("message").notNull(),
		type: notificationType("type").notNull(),
		status: notificationStatus("status").notNull().default("unread"),
		priority: integer("priority").default(0), // higher = more important

		createdAt: timestamp("created_at").defaultNow(),
		readAt: timestamp("read_at"),
		dismissedAt: timestamp("dismissed_at"),

		// Refs - notification can be for a user or salesperson
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		salespersonId: integer("salesperson_id").references(() => salespeople.id, { onDelete: "cascade" }),
		interactionId: integer("interaction_id").references(() => interactions.id, { onDelete: "cascade" }),
		flagId: integer("flag_id").references(() => flags.id, { onDelete: "cascade" }),
	},
	(_t) => [],
);

// System Prompt Settings
export const systemPromptSettings = pgTable(
	"system_prompt_settings",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		key: promptSettingKeys("key").notNull().unique(),
		value: jsonb("value").notNull(),

		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(_t) => [],
);

// =============================================================================
// EXTRACTION DATA TABLES
// =============================================================================
// These tables store structured data extracted from call transcripts during analysis.
// The extraction runs 3rd in the analysis pipeline (after rating and flagging).
//
// DATA MODEL:
// - Dictionary Tables (company-level): `objections`, `pain_points`
//   → Normalized categories that aggregate across all company calls
//   → Include frequency stats and company-wide trends
//
// - Junction Tables (per-call): `interaction_objections`, `interaction_pain_points`
//   → Link dictionary items to specific calls
//   → Store verbatim quotes, timestamps, clip ratings for training
//   → Enable queries like "show me all budget objections across calls"
//
// - Highlight Tables (per-call): `rep_highlights`
//   → Positive moments - what reps did well
//   → Aggregated by PerformerBenchmarkService for top performer patterns
//
// QUERYABILITY:
// - Find all objections by type: JOIN interaction_objections → objections WHERE title = 'Budget'
// - Find clip-worthy moments: WHERE clip_worthy_rating >= 7
// - Find rep strengths: SELECT skill_area, COUNT(*) FROM rep_highlights GROUP BY skill_area
// - Find patterns by sales phase: WHERE sales_phase = 'discovery'
// =============================================================================

export const salesPhase = pgEnum("sales_phase", ["outreach", "discovery", "demo", "close"]);
export const severityLevel = pgEnum("severity_level", ["critical", "major", "minor"]);
export const impactLevel = pgEnum("impact_level", ["high", "medium", "low"]);
export const trendDirection = pgEnum("trend_direction", ["up", "down", "stable"]);

// OBJECTIONS DICTIONARY - Company-level normalized objection categories
// Example: "Budget/Pricing", "Timing", "Competition", "Authority"
// Tracks frequency and success rates across all calls
export const objections = pgTable(
	"objections",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		title: text("title").notNull(),
		description: text("description").notNull(),
		frequency: integer("frequency").notNull().default(0),
		trend: trendDirection("trend").notNull().default("stable"),
		phase: salesPhase("phase").notNull(),
		impact: impactLevel("impact").notNull(),

		// Statistics
		totalCallsMentioned: integer("total_calls_mentioned").default(0),
		overcomePercentage: decimal("overcome_percentage", { precision: 5, scale: 2 }),

		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),

		// Refs
		companyId: integer("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),
	},
	(_t) => [],
);

// PAIN_POINTS DICTIONARY - Company-level normalized pain point categories
// Two types tracked via is_prospect_pain flag:
// - Prospect pains (is_prospect_pain=true): Challenges prospects face that product solves
//   Example: "Manual reporting", "Integration issues", "Scaling challenges"
// - Rep pains (is_prospect_pain=false): Weaknesses/skill gaps reps exhibit
//   Example: "Talking over prospect", "Missing closing opportunity", "Weak discovery"
export const painPoints = pgTable(
	"pain_points",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		title: text("title").notNull(),
		description: text("description").notNull(),
		frequency: integer("frequency").notNull().default(0),
		phase: salesPhase("phase").notNull(),
		severity: severityLevel("severity").notNull(),
		isProspectPain: boolean("is_prospect_pain").notNull(), // true = prospect pain, false = rep pain

		// Statistics
		totalCallsMentioned: integer("total_calls_mentioned").default(0),
		resolutionPercentage: decimal("resolution_percentage", { precision: 5, scale: 2 }),

		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),

		// Refs
		companyId: integer("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),
	},
	(_t) => [],
);

// INTERACTION_OBJECTIONS - Per-call objection instances with verbatim quotes
// Links a specific call to a dictionary objection with:
// - verbatim_quote: Exact words from prospect
// - timestamps: For video/audio clip extraction
// - rep_response: How rep handled it + effectiveness rating
// - clip_worthy_rating: 1-10 score for training value
export const interactionObjections = pgTable(
	"interaction_objections",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		interactionId: integer("interaction_id")
			.notNull()
			.references(() => interactions.id, { onDelete: "cascade" }),
		objectionId: integer("objection_id")
			.notNull()
			.references(() => objections.id, { onDelete: "cascade" }),
		wasOvercome: boolean("was_overcome").default(false),
		notes: text("notes"),
		createdAt: timestamp("created_at").defaultNow(),

		// Extraction data - verbatim quote and timestamps for clip playback
		verbatimQuote: text("verbatim_quote"),
		timestampStart: text("timestamp_start"), // e.g., "00:23:45"
		timestampEnd: text("timestamp_end"), // e.g., "00:23:58"
		salesPhase: text("sales_phase"), // outreach, discovery, demo, close

		// Rep response data
		repResponse: text("rep_response"),
		repResponseEffectiveness: text("rep_response_effectiveness"), // overcame, partially_addressed, missed, avoided
		repResponseTimestampStart: text("rep_response_timestamp_start"),
		repResponseTimestampEnd: text("rep_response_timestamp_end"),

		// Training clip rating
		clipWorthyRating: integer("clip_worthy_rating"), // 1-10
		clipReason: text("clip_reason"),
	},
	(_t) => [],
);

// INTERACTION_PAIN_POINTS - Per-call pain point instances with verbatim quotes
// Links a specific call to a dictionary pain point with:
// - verbatim_quote: Exact words from transcript
// - timestamps: For video/audio clip extraction
// - pain_type: "prospect_pain" or "rep_pain"
// - For prospect pains: capitalized_on tracks if rep leveraged it
// - For rep pains: root_cause tracks why the mistake happened
// - clip_worthy_rating: 1-10 score for training value
export const interactionPainPoints = pgTable(
	"interaction_pain_points",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		interactionId: integer("interaction_id")
			.notNull()
			.references(() => interactions.id, { onDelete: "cascade" }),
		painPointId: integer("pain_point_id")
			.notNull()
			.references(() => painPoints.id, { onDelete: "cascade" }),
		wasResolved: boolean("was_resolved").default(false),
		notes: text("notes"),
		createdAt: timestamp("created_at").defaultNow(),

		// Extraction data - verbatim quote and timestamps for clip playback
		verbatimQuote: text("verbatim_quote"),
		timestampStart: text("timestamp_start"), // e.g., "00:12:18"
		timestampEnd: text("timestamp_end"), // e.g., "00:12:45"
		salesPhase: text("sales_phase"), // outreach, discovery, demo, close
		painType: text("pain_type"), // prospect_pain, rep_pain

		// For prospect pain points - did rep capitalize on it?
		capitalizedOn: boolean("capitalized_on"),
		capitalizationQuote: text("capitalization_quote"),

		// For rep pain points - root cause analysis
		rootCause: text("root_cause"),

		// Training clip rating
		clipWorthyRating: integer("clip_worthy_rating"), // 1-10
		clipReason: text("clip_reason"),
	},
	(_t) => [],
);

// REP_HIGHLIGHTS - Positive moments extracted from calls (what reps did well)
// This is the OPPOSITE of rep_pain_points - tracks excellent technique execution
// Used for:
// - Aggregating top performer patterns (PerformerBenchmarkService)
// - Creating training clips showing "how to do it right"
// - Identifying which skills top performers excel at
//
// Key fields:
// - skill_area: Enum categorizing the skill (objection_handling, discovery, etc.)
// - technique: Named technique used (e.g., "ROI Reframe", "Pain Quantification")
// - verbatim_quote: Exact words from rep
// - timestamps: For video/audio clip extraction
// - impact: What happened as a result (prospect response)
// - clip_worthy_rating: 1-10 score for training value
export const repHighlightSkillArea = pgEnum("rep_highlight_skill_area", [
	"objection_handling",
	"discovery",
	"rapport",
	"pricing",
	"closing",
	"active_listening",
	"value_articulation",
]);

export const repHighlights = pgTable(
	"rep_highlights",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		interactionId: integer("interaction_id")
			.notNull()
			.references(() => interactions.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow(),

		// What skill area this highlight demonstrates
		skillArea: repHighlightSkillArea("skill_area").notNull(),

		// Short technique name (e.g., "ROI Reframe", "Pain Quantification")
		technique: text("technique").notNull(),

		// Extraction data - verbatim quote and timestamps for clip playback
		verbatimQuote: text("verbatim_quote").notNull(),
		timestampStart: text("timestamp_start"), // e.g., "00:23:45"
		timestampEnd: text("timestamp_end"), // e.g., "00:24:15"
		salesPhase: text("sales_phase"), // outreach, discovery, demo, close

		// Impact of this technique
		impact: text("impact"), // What happened as a result

		// Training clip rating
		clipWorthyRating: integer("clip_worthy_rating"), // 1-10
		clipReason: text("clip_reason"),
	},
	(_t) => [],
);

export const teams = pgTable("teams", {
	id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
	name: text("name").notNull(),
	companyId: integer("company_id")
		.notNull()
		.references(() => companies.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").defaultNow(),
});

export const teamMembership = pgTable(
	"team_membership",
	{
		teamId: integer("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		salespersonId: integer("salesperson_id")
			.notNull()
			.references(() => salespeople.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [unique().on(t.teamId, t.salespersonId)],
);

// Training Assignments Table - Unified system for all assignment sources
export const trainingAssignmentStatus = pgEnum("training_assignment_status", ["pending", "in_progress", "completed"]);
export const trainingAssignmentPriority = pgEnum("training_assignment_priority", ["low", "normal", "high"]);
export const trainingAssignmentSource = pgEnum("training_assignment_source", ["flag", "skill_threshold", "battle_card", "manual"]);
export const trainingType = pgEnum("training_type", ["scenario", "battle_card", "flag_review"]);

export const trainingAssignments = pgTable("training_assignments", {
	id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
	salespersonId: integer("salesperson_id")
		.notNull()
		.references(() => salespeople.id, { onDelete: "cascade" }),
	companyId: integer("company_id")
		.notNull()
		.references(() => companies.id, { onDelete: "cascade" }),

	// Source tracking - where did this assignment come from?
	assignmentSource: trainingAssignmentSource("assignment_source").notNull(),
	sourceId: text("source_id"), // flagId, skillKey, battleCardId - nullable for manual assignments

	// What to train on
	trainingType: trainingType("training_type").notNull(),
	trainingId: text("training_id").notNull(), // scenarioId, battleCardId, flagId

	// Display info
	title: text("title").notNull(),
	description: text("description"),

	// Assignment metadata
	priority: trainingAssignmentPriority("priority").default("normal"),
	assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }), // null if auto-assigned
	dueDate: timestamp("due_date"),

	// Status tracking
	status: trainingAssignmentStatus("status").notNull().default("pending"),
	completedAt: timestamp("completed_at"),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Training Feedback Loop Tables

// Stores aggregated AI context learned from company data
export const companyAiContext = pgTable("company_ai_context", {
	id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
	companyId: integer("company_id")
		.notNull()
		.references(() => companies.id, { onDelete: "cascade" }),
	contextType: aiContextTypes("context_type").notNull(),
	// Flexible JSONB storage for different context types:
	// - sales_language: {commonPhrases: [], productTerms: [], ...}
	// - objection_patterns: {patterns: [{objection, successfulResponse, frequency}]}
	// - success_patterns: {topPerformerTechniques: [], winningStrategies: []}
	// - terminology: {glossary: {term: definition}, productNames: []}
	// - anti_patterns: {avoidPatterns: [], lowRatedExamples: []}
	data: jsonb("data").notNull(),
	confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(), // 0.0000 to 1.0000
	sampleSize: integer("sample_size").notNull(), // How many data points contributed
	lastUpdated: timestamp("last_updated").defaultNow().notNull(),
	version: text("version").notNull().default("1.0"), // For tracking evolution of patterns
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stores labeled training examples from feedback data
export const trainingExamples = pgTable("training_examples", {
	id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
	companyId: integer("company_id")
		.notNull()
		.references(() => companies.id, { onDelete: "cascade" }),
	exampleType: trainingExampleTypes("example_type").notNull(),
	// Input data (e.g., transcript segment, call context)
	// Structure varies by exampleType:
	// - flag_generation: {transcriptSegment, callMetadata, speakerTurns}
	// - roleplay_scenario: {objectionType, context, dealStage}
	// - response_quality: {response, situation, outcome}
	// - insight_generation: {aggregatedData, timeframe, metrics}
	inputData: jsonb("input_data").notNull(),
	// Expected output that AI should produce
	// Structure varies by exampleType:
	// - flag_generation: {flagType, reasoning, betterResponse}
	// - roleplay_scenario: {scenarioPrompt, successCriteria}
	// - response_quality: {qualityScore, improvements}
	expectedOutput: jsonb("expected_output").notNull(),
	// Feedback signals that label this example
	// {repRating, coachNotes, badFlagReport, dealOutcome, managerReview}
	feedbackSignals: jsonb("feedback_signals").notNull(),
	// Derived quality score based on feedback
	quality: trainingQuality("quality").notNull(),
	// Reference to source flag if applicable
	sourceFlagId: integer("source_flag_id").references(() => flags.id, { onDelete: "set null" }),
	// Reference to source interaction if applicable
	sourceInteractionId: integer("source_interaction_id").references(() => interactions.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Training Scenarios - skill-based roleplay training modules
export const trainingScenarios = pgTable("training_scenarios", {
	id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
	skillKey: text("skill_key").notNull(), // e.g., 'objection_handling', 'pricing_discussions', 'discovery', 'closing'
	scenarioId: text("scenario_id").notNull().unique(), // e.g., 'pricing_objection_1'
	title: text("title").notNull(), // e.g., 'Budget Constraints - Enterprise Client'
	difficulty: text("difficulty").notNull(), // 'Beginner', 'Intermediate', 'Advanced'
	duration: text("duration").notNull(), // e.g., '15-20 min'
	participants: integer("participants").notNull().default(2),
	context: text("context").notNull(), // Brief context description
	scenario: text("scenario").notNull(), // Full scenario description
	objectives: jsonb("objectives").$type<string[]>().notNull(), // Array of training objectives
	commonObjections: jsonb("common_objections").$type<string[]>().notNull(), // Array of common objections
	idealOutcome: text("ideal_outcome").notNull(),
	aiPrompt: text("ai_prompt").notNull(), // Prompt for AI roleplay character
	firstMessage: text("first_message"), // Natural opening line from prospect that starts the roleplay
	prospectData: jsonb("prospect_data")
		.$type<{
			name: string;
			company: string;
			role: string;
			personality: string;
			avatarUrl?: string;
		}>()
		.notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Battle Cards - AI-generated tactical guides for handling objections/pain points
export const battleCardStatus = pgEnum("battle_card_status", ["draft", "active", "archived"]);

export const battleCards = pgTable(
	"battle_cards",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		companyId: integer("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),

		// Core battle card content
		title: text("title").notNull(), // e.g., "Budget constraints"
		challenge: text("challenge").notNull(), // Description of the challenge
		phase: salesPhase("phase").notNull(), // outreach, discovery, demo, close
		strategy: text("strategy").notNull(), // High-level strategy summary
		approach: jsonb("approach").$type<string[]>().notNull(), // 3 bullet points
		script: text("script").notNull(), // Example script to use
		nextStep: text("next_step").notNull(), // Recommended next action

		// Source tracking - what generated this battle card
		sourceType: text("source_type").notNull(), // 'objection', 'pain_point', 'manual'
		sourceId: integer("source_id"), // objectionId or painPointId

		// Impact metrics (from Phase 2 aggregation)
		frequency: integer("frequency").notNull().default(0),
		successRate: decimal("success_rate", { precision: 5, scale: 2 }),
		impactScore: decimal("impact_score", { precision: 5, scale: 2 }),

		// Status and metadata
		status: battleCardStatus("status").notNull().default("active"),
		difficultyLevel: integer("difficulty_level").notNull().default(1), // 1-5
		isActive: boolean("is_active").notNull().default(true),

		// Training scenario link
		linkedScenarioId: integer("linked_scenario_id").references(() => trainingScenarios.id, { onDelete: "set null" }),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(_t) => [],
);

// Training Sessions Completed - tracks individual training sessions per salesperson per scenario
// Mirrors the flag training pattern: check for existing session → reuse agent OR create new
export const trainingSessionStatus = pgEnum("training_session_status", ["in_progress", "completed"]);

export const trainingSessionsCompleted = pgTable(
	"training_sessions_completed",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		scenarioId: integer("scenario_id")
			.notNull()
			.references(() => trainingScenarios.id, { onDelete: "cascade" }),
		salespersonId: integer("salesperson_id")
			.notNull()
			.references(() => salespeople.id, { onDelete: "cascade" }),

		// ElevenLabs agent (same pattern as flags table)
		agentId: text("agent_id"),
		agentPrompt: jsonb("agent_prompt").$type<{
			systemPrompt: string;
			firstMessage: string;
		}>(),

		// Session tracking
		status: trainingSessionStatus("status").notNull().default("in_progress"),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),

		// Training session data (conversationId, score, duration) - same pattern as flags
		trainingSession: jsonb("training_session").$type<{
			conversationId?: string;
			score?: number;
			duration?: number;
			completedAt?: string;
		}>(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	// Note: A partial unique index (unique_in_progress_session_idx) is created via migration
	// to allow only one in_progress session per rep per scenario while allowing multiple completed sessions.
	// Drizzle doesn't support partial indexes in schema, so it's managed via SQL migration 0043.
);

// Call Personas - Extracted from every call to build a library of real industry-specific personas
// Used to synthesize realistic training scenarios with grounded facts + psychology
export const callPersonas = pgTable(
	"call_personas",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		interactionId: integer("interaction_id")
			.notNull()
			.references(() => interactions.id, { onDelete: "cascade" }),
		companyId: integer("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),

		// Prospect info
		prospectName: text("prospect_name"),
		prospectCompany: text("prospect_company"),
		prospectRole: text("prospect_role"),
		prospectIndustry: text("prospect_industry"),
		companySize: text("company_size"), // Small/Medium/Large/Enterprise
		location: text("location"),

		// Business context
		budgetRange: text("budget_range"),
		decisionTimeline: text("decision_timeline"),
		teamSize: text("team_size"),
		currentSolution: text("current_solution"),
		dealStage: text("deal_stage"), // awareness/consideration/decision/negotiation
		buyingAuthority: text("buying_authority"), // Champion/Influencer/Decision Maker
		painSeverity: integer("pain_severity"), // 1-10

		// Call context
		callType: text("call_type"), // discovery/demo/negotiation/closing/follow-up
		callStage: text("call_stage"), // early/mid/late
		keyTopics: jsonb("key_topics").$type<string[]>(),
		numbersDiscussed: jsonb("numbers_discussed").$type<string[]>(),
		competitorsMentioned: jsonb("competitors_mentioned").$type<string[]>(),

		// Key quotes for grounding roleplay
		objectionQuotes: jsonb("objection_quotes").$type<string[]>(),
		interestSignals: jsonb("interest_signals").$type<string[]>(),
		concernQuotes: jsonb("concern_quotes").$type<string[]>(),
		openingLine: text("opening_line"),

		// Communication patterns
		tone: text("tone"),
		communicationStyle: text("communication_style"),
		energyLevel: text("energy_level"),
		speechPatterns: jsonb("speech_patterns").$type<string[]>(),

		// Psychological persona (for authentic roleplay)
		coreIdentity: text("core_identity"),
		processingStyle: text("processing_style"),
		fillerWords: jsonb("filler_words").$type<string[]>(),
		speakingStyle: text("speaking_style"),
		psychologicalState: text("psychological_state"),
		feelingBeneathSurface: text("feeling_beneath_surface"),
		whatLearnedAboutSalespeople: text("what_learned_about_salespeople"),
		whatEarnsRespect: text("what_earns_respect"),
		whatTriggersShutdown: text("what_triggers_shutdown"),
		internalNarrator: text("internal_narrator"),
		bullshitDetector: text("bullshit_detector"),
		engagementThermostat: text("engagement_thermostat"),
		knowledgeNotShared: text("knowledge_not_shared"),
		mentalModelOfProblem: text("mental_model_of_problem"),
		resolutionPositive: text("resolution_positive"),
		resolutionNegative: text("resolution_negative"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(_t) => [],
);

// =============================================================================
// WORKFLOW ORCHESTRATION TABLES
// =============================================================================
// Tables for async workflow orchestration of training session creation
// Enables scalable processing of persona generation, agent creation, etc.

export const workflowType = pgEnum("workflow_type", ["scenario_session", "flag_session"]);
export const workflowStatus = pgEnum("workflow_status", ["pending", "processing", "completed", "failed"]);
export const stepStatus = pgEnum("step_status", ["pending", "running", "completed", "failed"]);
export const queueStatus = pgEnum("queue_status", ["pending", "locked", "completed", "failed"]);

// Workflow state - tracks overall workflow execution
export const workflowState = pgTable(
	"workflow_state",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		workflowType: workflowType("workflow_type").notNull(),
		workflowId: text("workflow_id").notNull(), // scenarioId or flagId (as string)
		status: workflowStatus("status").notNull().default("pending"),
		currentStep: text("current_step"), // Name of current step being executed
		metadata: jsonb("metadata").$type<{
			userId?: string;
			salespersonId?: number;
			scenarioId?: number | string;
			flagId?: number;
			[key: string]: unknown;
		}>(), // Input parameters and context
		result: jsonb("result").$type<{
			agentId?: string;
			signedUrl?: string;
			sessionId?: number;
			scenario?: unknown;
			battleCard?: unknown;
			flag?: unknown;
			interaction?: unknown;
			salesperson?: unknown;
			prospectData?: unknown;
			[key: string]: unknown;
		}>(), // Final result data
		error: text("error"), // Error message if failed
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
	},
	(_t) => [
		// Index for worker queries (find pending/processing workflows)
		{
			name: "workflow_state_status_created_at_idx",
			columns: [_t.status, _t.createdAt],
		},
		// Index for lookups by workflow type and ID
		{
			name: "workflow_state_type_id_idx",
			columns: [_t.workflowType, _t.workflowId],
		},
	],
);

// Workflow step runs - tracks individual step execution history
export const workflowStepRuns = pgTable(
	"workflow_step_runs",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		workflowStateId: integer("workflow_state_id")
			.notNull()
			.references(() => workflowState.id, { onDelete: "cascade" }),
		stepName: text("step_name").notNull(), // e.g., "generate_persona", "create_agent", "get_signed_url"
		status: stepStatus("status").notNull().default("pending"),
		inputData: jsonb("input_data"), // Step input parameters
		outputData: jsonb("output_data"), // Step output/result
		error: text("error"), // Error message if step failed
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		durationMs: integer("duration_ms"), // Duration in milliseconds
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(_t) => [
		// Index for workflow history queries
		{
			name: "workflow_step_runs_state_id_started_at_idx",
			columns: [_t.workflowStateId, _t.startedAt],
		},
	],
);

// Workflow queue - DB-backed job queue for worker polling
export const workflowQueue = pgTable(
	"workflow_queue",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		workflowStateId: integer("workflow_state_id")
			.notNull()
			.references(() => workflowState.id, { onDelete: "cascade" }),
		priority: integer("priority").notNull().default(0), // Higher priority = processed first
		status: queueStatus("status").notNull().default("pending"),
		attempts: integer("attempts").notNull().default(0),
		maxAttempts: integer("max_attempts").notNull().default(3),
		scheduledAt: timestamp("scheduled_at").defaultNow().notNull(), // When to process (for delayed jobs)
		lockedAt: timestamp("locked_at"), // When worker locked this job
		lockedBy: text("locked_by"), // Worker identifier (hostname + pid)
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(_t) => [
		// Index for worker polling (find next job to process)
		{
			name: "workflow_queue_status_priority_scheduled_at_idx",
			columns: [_t.status, _t.priority, _t.scheduledAt],
		},
		// Unique constraint - one queue entry per workflow state
		{
			name: "workflow_queue_state_id_unique",
			columns: [_t.workflowStateId],
			unique: true,
		},
	],
);
