import type { MiddlewareHandler } from "hono";
import type { AuthVariable } from "#/lib/types";
import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Middleware to require site admin role
 */
export const requireSiteAdmin: MiddlewareHandler<AuthVariable<false>> = async (c, next) => {
	const currentUser = c.get("user");
	if (!currentUser) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, currentUser.id));

	const isSiteAdmin = userRoles.some((role) => role.role === "admin");

	if (!isSiteAdmin) {
		return c.json({ error: "Forbidden: Admin access required" }, 403);
	}

	return next();
};

/**
 * Check if user has access to a specific salesperson's data
 * Access granted if:
 * 1. User is the salesperson themselves
 * 2. User is in the same company
 * 3. User is a site admin
 *
 * @param userId - The ID of the user requesting access
 * @param salesperson - Either a salesperson ID (number) or the full salesperson object
 */
export async function checkSalespersonAccess(
	userId: string,
	salesperson: number | typeof schema.salespeople.$inferSelect,
): Promise<boolean> {
	// If number, fetch the salesperson first
	let salesPersonData: typeof schema.salespeople.$inferSelect;
	if (typeof salesperson === "number") {
		const result = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, salesperson)).limit(1);
		if (result.length === 0) return false;
		salesPersonData = result[0];
	} else {
		salesPersonData = salesperson;
	}

	// 1. Check if user is accessing their own data
	if (salesPersonData.associatedUserId === userId) return true;

	// 2. Check if user is in the same company as the salesperson
	const userCompanyRoles = await db.select().from(schema.companyUserRoles).where(eq(schema.companyUserRoles.userId, userId));
	if (userCompanyRoles.some((role) => role.companyId === salesPersonData.companyId)) return true;

	// 3. Check if user is site admin
	const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, userId));
	if (userRoles.some((role) => role.role === "admin")) return true;

	return false;
}

/**
 * Check if user has access to a specific company
 * Access granted if:
 * 1. User has a role in the company (via companyUserRoles)
 * 2. User is a salesperson in the company
 * 3. User is a site admin
 */
export async function checkCompanyAccess(userId: string, companyId: number): Promise<boolean> {
	// 1. Check if user has a company role
	const companyRoles = await db
		.select()
		.from(schema.companyUserRoles)
		.where(and(eq(schema.companyUserRoles.userId, userId), eq(schema.companyUserRoles.companyId, companyId)));

	if (companyRoles.length > 0) return true;

	// 2. Check if user is a salesperson in the company
	const salesperson = await db
		.select()
		.from(schema.salespeople)
		.where(and(eq(schema.salespeople.associatedUserId, userId), eq(schema.salespeople.companyId, companyId)))
		.limit(1);

	if (salesperson.length > 0) return true;

	// 3. Check if user is site admin
	const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, userId));
	const isSiteAdmin = userRoles.some((role) => role.role === "admin");
	if (isSiteAdmin) return true;

	return false;
}

/**
 * Check if user has access to a specific interaction
 * Access is determined by checking if user has access to the salesperson associated with the interaction
 */
export async function checkInteractionAccess(userId: string, interactionId: number): Promise<boolean> {
	const interaction = await db.select().from(schema.interactions).where(eq(schema.interactions.id, interactionId)).limit(1);

	if (interaction.length === 0) {
		return false;
	}

	const salespersonId = interaction[0].salespersonId;
	return checkSalespersonAccess(userId, salespersonId);
}

/**
 * Check if user has access to a specific file
 * Access is determined by:
 * 1. If file is associated with an interaction, check interaction access
 * 2. If file has no interaction, check if user is site admin
 */
export async function checkFileAccess(userId: string, fileId: number): Promise<boolean> {
	const file = await db.select().from(schema.bigfiles).where(eq(schema.bigfiles.id, fileId)).limit(1);

	if (file.length === 0) {
		return false;
	}

	const fileData = file[0];

	// If file is associated with an interaction, check interaction access
	if (fileData.interactionId) {
		return checkInteractionAccess(userId, fileData.interactionId);
	}

	// If no interaction association, only site admins can access
	const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, userId));
	const isSiteAdmin = userRoles.some((role) => role.role === "admin");

	return isSiteAdmin;
}

/**
 * Middleware to require interaction access
 * Usage: .use("/:id/*", requireInteractionAccess("id"))
 * Or: .get("/:id", zValidator("param", z.object({ id: z.coerce.number().int().positive() })), requireInteractionAccess("id"), handler)
 */
export function requireInteractionAccess<T extends string>(
	paramName: T,
): MiddlewareHandler<
	AuthVariable<false>,
	any,
	{
		out: {
			param: {
				[K in T]: number;
			};
		};
	}
> {
	return async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const interactionId = c.req.valid("param")[paramName];
		if (!interactionId) {
			return c.json({ error: `Invalid ${paramName}` }, 400);
		}

		const hasAccess = await checkInteractionAccess(currentUser.id, interactionId);
		if (!hasAccess) {
			return c.json({ error: "Forbidden: No access to this interaction" }, 403);
		}

		return next();
	};
}

/**
 * Middleware to require file access
 * Usage: .use("/:id/*", requireFileAccess("id"))
 * Or: .get("/:id", zValidator("param", z.object({ id: z.coerce.number().int().positive() })), requireFileAccess("id"), handler)
 */
export function requireFileAccess<T extends string>(
	paramName: T,
): MiddlewareHandler<
	AuthVariable<false>,
	any,
	{
		out: {
			param: {
				[K in T]: number;
			};
		};
	}
> {
	return async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const fileId = c.req.valid("param")[paramName];
		if (!fileId) {
			return c.json({ error: `Invalid ${paramName}` }, 400);
		}

		const hasAccess = await checkFileAccess(currentUser.id, fileId);
		if (!hasAccess) {
			return c.json({ error: "Forbidden: No access to this file" }, 403);
		}

		return next();
	};
}

/**
 * Middleware to require salesperson access
 * Usage: .use("/:id/*", requireSalespersonAccess("id"))
 * Or: .get("/:id", zValidator("param", z.object({ id: z.coerce.number().int().positive() })), requireSalespersonAccess("id"), handler)
 */
export function requireSalespersonAccess<T extends string>(
	paramName: T,
): MiddlewareHandler<
	AuthVariable<false>,
	any,
	{
		out: {
			param: {
				[K in T]: number;
			};
		};
	}
> {
	return async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const salespersonId = c.req.valid("param")[paramName];
		if (!salespersonId) {
			return c.json({ error: `Invalid ${paramName}` }, 400);
		}

		const hasAccess = await checkSalespersonAccess(currentUser.id, salespersonId);
		if (!hasAccess) {
			return c.json({ error: "Forbidden: No access to this salesperson" }, 403);
		}

		return next();
	};
}

/**
 * Middleware to require company access
 * Usage: .use("/:id/*", requireCompanyAccess("id"))
 * Or: .get("/:id", zValidator("param", z.object({ id: z.coerce.number().int().positive() })), requireCompanyAccess("id"), handler)
 */
export function requireCompanyAccess<T extends string>(
	paramName: T,
): MiddlewareHandler<
	AuthVariable<false>,
	any,
	{
		out: {
			param: {
				[K in T]: number;
			};
		};
	}
> {
	return async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const companyId = c.req.valid("param")[paramName];
		if (!companyId) {
			return c.json({ error: `Invalid ${paramName}` }, 400);
		}

		const hasAccess = await checkCompanyAccess(currentUser.id, companyId);
		if (!hasAccess) {
			return c.json({ error: "Forbidden: No access to this company" }, 403);
		}

		return next();
	};
}

/**
 * Get user's salesperson ID if they have one
 */
export async function getUserSalespersonId(userId: string): Promise<number | null> {
	const salesperson = await db
		.select({ id: schema.salespeople.id })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	return salesperson[0]?.id ?? null;
}

/**
 * Get user's company ID (either through salesperson or company roles)
 */
export async function getUserCompanyId(userId: string): Promise<number | null> {
	// First check if user is a salesperson
	const salesperson = await db
		.select({ companyId: schema.salespeople.companyId })
		.from(schema.salespeople)
		.where(eq(schema.salespeople.associatedUserId, userId))
		.limit(1);

	if (salesperson.length > 0) {
		return salesperson[0].companyId;
	}

	// Otherwise check company roles
	const companyRole = await db
		.select({ companyId: schema.companyUserRoles.companyId })
		.from(schema.companyUserRoles)
		.where(eq(schema.companyUserRoles.userId, userId))
		.limit(1);

	return companyRole[0]?.companyId ?? null;
}

/**
 * Get salesperson for a user, with admin fallback.
 * If user is not a salesperson, admins get a fallback salesperson from their company.
 *
 * @param userId - The ID of the user
 * @returns Object with salesperson and isAdminFallback, or null if no access
 */
export async function getSalespersonForUserWithAdminFallback(
	userId: string,
): Promise<{ salesperson: typeof schema.salespeople.$inferSelect; isAdminFallback: boolean } | null> {
	// First try to get salesperson directly
	const directSalesperson = await db.select().from(schema.salespeople).where(eq(schema.salespeople.associatedUserId, userId)).limit(1);

	if (directSalesperson.length > 0) {
		return { salesperson: directSalesperson[0], isAdminFallback: false };
	}

	// User is not a salesperson - check if they're an admin
	const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, userId));
	const isSiteAdmin = userRoles.some((role) => role.role === "admin");

	if (!isSiteAdmin) {
		return null;
	}

	// Admin user - get their company and use first salesperson in that company
	const companyId = await getUserCompanyId(userId);
	if (!companyId) {
		// Site admin with no company - use any salesperson
		const anySalesperson = await db.select().from(schema.salespeople).limit(1);
		if (anySalesperson.length > 0) {
			return { salesperson: anySalesperson[0], isAdminFallback: true };
		}
		return null;
	}

	// Get first salesperson in admin's company
	const companySalesperson = await db.select().from(schema.salespeople).where(eq(schema.salespeople.companyId, companyId)).limit(1);

	if (companySalesperson.length > 0) {
		return { salesperson: companySalesperson[0], isAdminFallback: true };
	}

	return null;
}

/**
 * Check if user is a manager/admin in a specific company
 * Manager access granted if:
 * 1. User has 'admin' role in the company (via companyUserRoles)
 * 2. User is a site admin
 *
 * @param userId - The ID of the user to check
 * @param companyId - The company ID to check manager status for
 */
export async function checkManagerAccess(userId: string, companyId: number): Promise<boolean> {
	// 1. Check if user has admin role in the company
	const companyRoles = await db
		.select()
		.from(schema.companyUserRoles)
		.where(and(eq(schema.companyUserRoles.userId, userId), eq(schema.companyUserRoles.companyId, companyId)));

	if (companyRoles.some((role) => role.role === "admin")) return true;

	// 2. Check if user is site admin
	const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, userId));
	if (userRoles.some((role) => role.role === "admin")) return true;

	return false;
}

/**
 * Middleware to set RLS session variables for database-level security.
 * This should be used on routes that access company-scoped data.
 *
 * Sets:
 * - app.company_id: The current user's company ID
 * - app.is_site_admin: Whether the user is a site admin
 *
 * These variables are used by PostgreSQL RLS policies as a defense-in-depth
 * layer on top of application-level authorization checks.
 */
export const setRlsContext: MiddlewareHandler<AuthVariable<false>> = async (c, next) => {
	const currentUser = c.get("user");

	if (!currentUser) {
		// No user - clear RLS context
		await db.execute(sql`SELECT set_config('app.company_id', '', true)`);
		await db.execute(sql`SELECT set_config('app.is_site_admin', 'false', true)`);
		return next();
	}

	// Get user's company ID
	const companyId = await getUserCompanyId(currentUser.id);

	// Check if user is site admin
	const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, currentUser.id));
	const isSiteAdmin = userRoles.some((role) => role.role === "admin");

	// Set session variables for RLS
	await db.execute(sql`SELECT set_config('app.company_id', ${companyId?.toString() ?? ""}, true)`);
	await db.execute(sql`SELECT set_config('app.is_site_admin', ${isSiteAdmin.toString()}, true)`);

	return next();
};
