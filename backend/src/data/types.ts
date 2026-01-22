/**
 * Type definitions derived from Drizzle schema
 * Frontend uses generated Hono client types instead
 */
import type * as schema from "./schema";

/**
 * Metadata extracted from sales call interactions
 * Includes prospect information, call context, company details, and communication patterns
 */
export type InteractionMetadata = {
	prospect?: {
		name?: string;
		company?: string;
		companySize?: string;
		title?: string;
		email?: string;
		phone?: string;
	};
	company?: {
		industry?: string;
	};
	context?: {
		callDuration?: string;
		callDate?: string;
		callType?: string;
	};
	communication?: {
		tone?: string;
		vocalQualities?: string;
		speechPatterns?: string[];
		communicationStyle?: string;
		energyLevel?: string;
		concerns?: string[];
		openingLine?: string;
	};
	summary?: {
		overview?: string;
		topicsDiscussed?: string[];
		outcome?: string;
		nextSteps?: string[];
		keyMoments?: string[];
	};
	extractedAt?: string;
};

// Infer base types from Drizzle schema
type Interaction = typeof schema.interactions.$inferSelect;
type Rating = typeof schema.ratings.$inferSelect;
type Flag = typeof schema.flags.$inferSelect;
type Bigfile = typeof schema.bigfiles.$inferSelect;
type SkillsAssessment = typeof schema.skillsAssessments.$inferSelect;

/**
 * Response type for the optimized interactions-with-relations endpoint
 * Contains paginated interactions with all related data preloaded
 */
export type InteractionWithRelations = Interaction & {
	ratings: Rating[];
	flags: Flag[];
	bigfiles: Bigfile[];
	skillsAssessments: SkillsAssessment[];
};

/**
 * Response type for the paginated interactions-with-relations endpoint
 */
export type InteractionsWithRelationsResponse = {
	data: InteractionWithRelations[];
	total: number;
	page: number;
	pageSize: number;
};
