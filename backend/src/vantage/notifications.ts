import { db } from "#/data";
import { eq, and, or, desc } from "drizzle-orm";
import * as schema from "#/data/schema";

export async function getNotifications(userId: string) {
	// First, get the user's company ID through their salesperson record
	const userSalesperson = await db
		.select({ companyId: schema.salespeople.companyId })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	if (userSalesperson.length === 0) {
		// If user is not a salesperson, just get notifications for the user
		const notifications = await db
			.select()
			.from(schema.notifications)
			.where(eq(schema.notifications.userId, userId))
			.orderBy(desc(schema.notifications.priority), desc(schema.notifications.createdAt));

		return notifications;
	}

	// Get the salesperson ID for notifications
	const salesperson = await db
		.select({ id: schema.salespeople.id })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	const salespersonId = salesperson[0]?.id;

	// Get notifications for both user and salesperson
	const notifications = await db
		.select()
		.from(schema.notifications)
		.where(
			salespersonId
				? or(eq(schema.notifications.userId, userId), eq(schema.notifications.salespersonId, salespersonId))
				: eq(schema.notifications.userId, userId),
		)
		.orderBy(desc(schema.notifications.priority), desc(schema.notifications.createdAt));

	return notifications;
}

export async function markNotificationRead(notificationId: number, userId: string) {
	// First fetch the salesperson ID to avoid subquery issues
	const salesperson = await db
		.select({ id: schema.salespeople.id })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	const salespersonId = salesperson[0]?.id;

	// Build WHERE clause based on whether user has a salesperson ID
	const whereClause = salespersonId
		? and(
				eq(schema.notifications.id, notificationId),
				or(eq(schema.notifications.userId, userId), eq(schema.notifications.salespersonId, salespersonId)),
			)
		: and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, userId));

	const result = await db
		.update(schema.notifications)
		.set({
			status: "read",
			readAt: new Date(),
		})
		.where(whereClause)
		.returning();

	return result[0] ?? null;
}

export async function dismissNotification(notificationId: number, userId: string) {
	// First fetch the salesperson ID to avoid subquery issues
	const salesperson = await db
		.select({ id: schema.salespeople.id })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	const salespersonId = salesperson[0]?.id;

	// Build WHERE clause based on whether user has a salesperson ID
	const whereClause = salespersonId
		? and(
				eq(schema.notifications.id, notificationId),
				or(eq(schema.notifications.userId, userId), eq(schema.notifications.salespersonId, salespersonId)),
			)
		: and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, userId));

	const result = await db
		.update(schema.notifications)
		.set({
			status: "dismissed",
			dismissedAt: new Date(),
		})
		.where(whereClause)
		.returning();

	return result[0] ?? null;
}

export async function markAllNotificationsRead(userId: string) {
	// First, get the user's salesperson ID if they have one
	const salesperson = await db
		.select({ id: schema.salespeople.id })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	const salespersonId = salesperson[0]?.id;

	const result = await db
		.update(schema.notifications)
		.set({
			status: "read",
			readAt: new Date(),
		})
		.where(
			and(
				eq(schema.notifications.status, "unread"),
				salespersonId
					? or(eq(schema.notifications.userId, userId), eq(schema.notifications.salespersonId, salespersonId))
					: eq(schema.notifications.userId, userId),
			),
		)
		.returning();

	return result;
}

export async function deleteNotification(notificationId: number, userId: string) {
	// First fetch the salesperson ID to avoid subquery issues
	const salesperson = await db
		.select({ id: schema.salespeople.id })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	const salespersonId = salesperson[0]?.id;

	// Build WHERE clause based on whether user has a salesperson ID
	const whereClause = salespersonId
		? and(
				eq(schema.notifications.id, notificationId),
				or(eq(schema.notifications.userId, userId), eq(schema.notifications.salespersonId, salespersonId)),
			)
		: and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, userId));

	const result = await db.delete(schema.notifications).where(whereClause).returning();

	return result[0] ?? null;
}
