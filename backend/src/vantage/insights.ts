import { db } from "#/data";
import { eq, and, or, desc, sql } from "drizzle-orm";
import * as schema from "#/data/schema";

// Re-export notification functions from notifications.ts (single source of truth)
export { markNotificationRead, dismissNotification, markAllNotificationsRead, deleteNotification } from "./notifications";

export async function insightsData(userId: string) {
	// First, get the user's company ID through their salesperson record
	const userSalesperson = await db
		.select({ companyId: schema.salespeople.companyId })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	if (userSalesperson.length === 0) {
		// If user is not a salesperson, check if they have company roles
		const userCompanyRoles = await db
			.select({ companyId: schema.companyUserRoles.companyId })
			.from(schema.companyUserRoles)
			.where(eq(schema.companyUserRoles.userId, userId))
			.limit(1);

		if (userCompanyRoles.length === 0) {
			// If user has no company association, return empty data
			return {
				notifications: [],
				objections: [],
				prospectPainPoints: [],
				repPainPoints: [],
				totalOrgCalls: 0,
			};
		}

		const companyId = userCompanyRoles[0].companyId;

		// Get data for company admin/user
		const [notifications, objections, painPoints, totalOrgCallsResult] = await Promise.all([
			// Get notifications for the user
			db
				.select()
				.from(schema.notifications)
				.where(eq(schema.notifications.userId, userId))
				.orderBy(schema.notifications.createdAt),

			// Get objections for the company, sorted by frequency descending
			db
				.select()
				.from(schema.objections)
				.where(eq(schema.objections.companyId, companyId))
				.orderBy(desc(schema.objections.frequency)),

			// Get pain points for the company, sorted by frequency descending
			db
				.select()
				.from(schema.painPoints)
				.where(eq(schema.painPoints.companyId, companyId))
				.orderBy(desc(schema.painPoints.frequency)),

			// Get total processed interactions count for the company
			db
				.select({ count: sql<number>`COUNT(*)`.as("count") })
				.from(schema.interactions)
				.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
				.where(and(eq(schema.salespeople.companyId, companyId), eq(schema.interactions.processedStatus, "processed"))),
		]);

		// Separate prospect and rep pain points
		const prospectPainPoints = painPoints.filter((p) => p.isProspectPain);
		const repPainPoints = painPoints.filter((p) => !p.isProspectPain);

		return {
			notifications,
			objections,
			prospectPainPoints,
			repPainPoints,
			totalOrgCalls: Number(totalOrgCallsResult[0]?.count ?? 0),
		};
	}

	const companyId = userSalesperson[0].companyId;

	// Get the salesperson ID for notifications
	const salesperson = await db
		.select({ id: schema.salespeople.id })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	const salespersonId = salesperson[0]?.id;

	// Get all insights data for the salesperson and their company
	const [notifications, objections, painPoints, totalOrgCallsResult] = await Promise.all([
		// Get notifications for both user and salesperson
		db
			.select()
			.from(schema.notifications)
			.where(
				salespersonId
					? and(or(eq(schema.notifications.userId, userId), eq(schema.notifications.salespersonId, salespersonId)))
					: eq(schema.notifications.userId, userId),
			)
			.orderBy(schema.notifications.priority, schema.notifications.createdAt),

		// Get objections for the company, sorted by frequency descending
		db
			.select()
			.from(schema.objections)
			.where(eq(schema.objections.companyId, companyId))
			.orderBy(desc(schema.objections.frequency)),

		// Get pain points for the company, sorted by frequency descending
		db
			.select()
			.from(schema.painPoints)
			.where(eq(schema.painPoints.companyId, companyId))
			.orderBy(desc(schema.painPoints.frequency)),

		// Get total processed interactions count for the company
		db
			.select({ count: sql<number>`COUNT(*)`.as("count") })
			.from(schema.interactions)
			.innerJoin(schema.salespeople, eq(schema.interactions.salespersonId, schema.salespeople.id))
			.where(and(eq(schema.salespeople.companyId, companyId), eq(schema.interactions.processedStatus, "processed"))),
	]);

	// Separate prospect and rep pain points
	const prospectPainPoints = painPoints.filter((p) => p.isProspectPain);
	const repPainPoints = painPoints.filter((p) => !p.isProspectPain);

	return {
		notifications,
		objections,
		prospectPainPoints,
		repPainPoints,
		totalOrgCalls: Number(totalOrgCallsResult[0]?.count ?? 0),
	};
}
