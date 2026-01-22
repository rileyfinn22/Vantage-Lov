import type { Handler } from "hono";
import type { AuthVariable } from "#/lib/types";
import { db } from "#/data";
import { user, authUserRoles, companyUserRoles, companies } from "#/data/schema";
import { sql, eq } from "drizzle-orm";
import { logger } from "#/lib/logger";

export const myUserHandler: Handler<AuthVariable<true>> = async (c) => {
	const currentUser = c.get("user");

	if (!currentUser) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	try {
		const siteRoles = await db.select({ role: authUserRoles.role }).from(authUserRoles).where(eq(authUserRoles.userId, currentUser.id));

		const companyRolesWithNames = await db
			.select({
				companyId: companyUserRoles.companyId,
				companyName: companies.name,
				role: companyUserRoles.role,
			})
			.from(companyUserRoles)
			.innerJoin(companies, eq(companyUserRoles.companyId, companies.id))
			.where(eq(companyUserRoles.userId, currentUser.id));

		return c.json({
			user: {
				id: currentUser.id,
				name: currentUser.name,
				email: currentUser.email,
				image: currentUser.image,
				emailVerified: currentUser.emailVerified,
				createdAt: currentUser.createdAt,
				updatedAt: currentUser.updatedAt,
			},
			roles: {
				siteRoles: siteRoles.map((r) => r.role),
				companyRoles: companyRolesWithNames,
			},
		});
	} catch (error) {
		logger.error({ error }, "Error fetching user data");
		return c.json({ error: "Internal server error" }, 500);
	}
};

export const healthHandler: Handler = async (c) => {
	try {
		// Simple database connectivity check without exposing user counts
		await db
			.select({ count: sql`count(*)`.mapWith(Number) })
			.from(user)
			.limit(1);
		return c.json({
			status: "ok",
			timestamp: new Date().toISOString(),
			database: {
				connected: true,
			},
		});
	} catch (error) {
		logger.error({ error }, "Database connection error");
		return c.json(
			{
				status: "error",
				timestamp: new Date().toISOString(),
				database: {
					connected: false,
					// In production, don't expose error details
					...(process.env.NODE_ENV !== "production" && {
						error: error instanceof Error ? error.message : "Unknown database error",
					}),
				},
			},
			500,
		);
	}
};
