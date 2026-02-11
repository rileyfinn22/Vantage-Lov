import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import * as schema from "#/data/schema";
import { db } from "#/data";
import { eq, ne, gte, lte, like, and, count, type SQL } from "drizzle-orm";
import { Table, is } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { memoize } from "es-toolkit";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import type { ZodObject, ZodRawShape } from "zod";
import { logger } from "#/lib/logger";
import { getUserCompanyId } from "#/middleware/authorization";

/**
 * Creates a parameter validator with consistent error handling
 * @param schema - Zod object schema for parameter validation
 * @param errorMessage - Custom error message (optional)
 * @returns zValidator middleware for parameter validation
 */
const createParamValidator = <T extends ZodRawShape>(schema: ZodObject<T>, errorMessage: string = "Invalid parameters") => {
	return zValidator("param", schema, (result, c) => {
		if (!result.success) {
			// const { message } = result.error;
			logger.warn({ issues: result.error.issues }, "Parameter validation failed");
			return c.json({ error: errorMessage }, 400);
		}
	});
};

// Reusable validation schemas
const resourceSchema = z.object({
	resource: z
		.string()
		.min(1)
		.max(60)
		.regex(/^[a-zA-Z0-9-]+$/, "Resource name must contain only alphanumeric characters and dashes"),
});

const resourceWithIdSchema = z.object({
	resource: z
		.string()
		.min(1)
		.max(60)
		.regex(/^[a-zA-Z0-9-]+$/, "Resource name must contain only alphanumeric characters and dashes"),
	// id: z.string().regex(/^(\d{1,6})|([a-zA-Z0-9]{32})$/, "ID must be a positive integer"),
	id: z.union([
		z.coerce.number().int().min(1).max(999999),
		z.string().regex(/^[a-zA-Z0-9]{32}$/, "ID must be a 32-character alphanumeric string"),
	]),
});

const getAvailableTables = memoize(() => {
	const tables: Record<string, any> = {};
	for (const [, table] of Object.entries(schema)) {
		if (is(table, Table)) {
			const { name: tableName } = getTableConfig(table);
			tables[tableName] = table;
		}
	}
	return tables;
});

/**
 * Get allowed filter fields for a table
 * Returns all column names for the table
 */
function getAllowedFilterFields(table: any): Set<string> {
	const config = getTableConfig(table);
	const allowedFields = new Set<string>();

	// Add all column names from the table
	for (const [columnName] of Object.entries(config.columns)) {
		allowedFields.add(columnName);
	}

	return allowedFields;
}

/**
 * Parses simple-rest style query parameters into Drizzle WHERE conditions
 * Supports operators: eq (default), ne, gte, lte, like (contains)
 * @param queryParams - URL query parameters
 * @param table - Drizzle table reference
 * @returns Array of SQL conditions to be combined with AND
 */
const parseFiltersFromQuery = (queryParams: Record<string, string>, table: any): SQL[] => {
	const conditions: SQL[] = [];
	const allowedFields = getAllowedFilterFields(table);

	for (const [key, value] of Object.entries(queryParams)) {
		// Skip pagination and sorting parameters
		if (["_start", "_end", "_limit", "_page", "_sort", "_order"].includes(key)) {
			continue;
		}

		// Handle special search parameter
		if (key === "q") {
			// For general search, we'd need to implement full-text search
			// Skip for now as it requires table-specific logic
			continue;
		}

		// Parse operator from parameter name
		let field = key;
		let operator = "eq"; // default operator

		if (key.endsWith("_ne")) {
			field = key.slice(0, -3);
			operator = "ne";
		} else if (key.endsWith("_gte")) {
			field = key.slice(0, -4);
			operator = "gte";
		} else if (key.endsWith("_lte")) {
			field = key.slice(0, -4);
			operator = "lte";
		} else if (key.endsWith("_like")) {
			field = key.slice(0, -5);
			operator = "like";
		}

		// Validate field against whitelist
		if (!allowedFields.has(field)) {
			logger.warn({ field }, "Field not in whitelist for table, skipping filter");
			continue;
		}

		// Check if field exists in table (belt and suspenders)
		if (!(field in table)) {
			logger.warn({ field }, "Field not found in table, skipping filter");
			continue;
		}

		// Create appropriate condition based on operator
		try {
			const column = table[field];
			let parsedValue: any = value;

			// Try to parse numeric values
			if (!Number.isNaN(Number(value)) && value !== "") {
				parsedValue = Number(value);
			}

			switch (operator) {
				case "eq":
					conditions.push(eq(column, parsedValue));
					break;
				case "ne":
					conditions.push(ne(column, parsedValue));
					break;
				case "gte":
					conditions.push(gte(column, parsedValue));
					break;
				case "lte":
					conditions.push(lte(column, parsedValue));
					break;
				case "like":
					conditions.push(like(column, `%${value}%`));
					break;
			}
		} catch (error) {
			logger.warn({ field, error }, "Failed to create filter condition");
		}
	}

	return conditions;
};

// Tables that should be filtered by company when admin has a company association
const COMPANY_SCOPED_TABLES = new Set(["companies", "salespeople", "teams", "interactions", "flags", "company_user_roles"]);

// Mapping of table name to the column used for company filtering
const TABLE_COMPANY_COLUMN: Record<string, string> = {
	companies: "id",
	salespeople: "companyId",
	teams: "companyId",
	interactions: "salespersonId", // Needs special handling - filter through salesperson
	flags: "interactionId", // Needs special handling - filter through interaction
	company_user_roles: "companyId",
};

const app = new Hono<AuthVariable<false> & { Variables: { adminCompanyId: number | null } }>()
	.use("*", async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, currentUser.id));

		const isSiteAdmin = userRoles.some((role) => role.role === "admin");

		if (!isSiteAdmin) {
			return c.json({ error: "Forbidden: Admin access required" }, 403);
		}

		// Get admin's company ID (null if no company = super admin who can see all)
		const adminCompanyId = await getUserCompanyId(currentUser.id);
		c.set("adminCompanyId", adminCompanyId);

		logger.info({ userId: currentUser.id, email: currentUser.email, adminCompanyId }, "Admin request - company context");

		return next();
	})
	.get("/tables", async (c) => {
		const tables = getAvailableTables();
		return c.json({ tables: Object.keys(tables) });
	})
	.get("/:resource", createParamValidator(resourceSchema, "Invalid resource parameter"), async (c) => {
		const resource = c.req.valid("param").resource;
		const tables = getAvailableTables();
		const table = tables[resource];

		if (!table) {
			return c.json({ error: "Resource not found" }, 404);
		}

		// Get admin's company ID for filtering
		const adminCompanyId = c.get("adminCompanyId");

		// Parse query parameters for filters
		const queryParams = c.req.queries();
		const flatParams: Record<string, string> = {};

		// Flatten query parameters (Hono returns arrays)
		for (const [key, values] of Object.entries(queryParams)) {
			if (values && values.length > 0) {
				flatParams[key] = values[0];
			}
		}

		// Parse filters from query parameters
		const filterConditions = parseFiltersFromQuery(flatParams, table);

		// Add company filter if admin has a company association and table is company-scoped
		if (adminCompanyId !== null && COMPANY_SCOPED_TABLES.has(resource)) {
			const companyColumn = TABLE_COMPANY_COLUMN[resource];
			if (companyColumn && companyColumn in table) {
				if (resource === "companies") {
					// For companies table, filter by id
					filterConditions.push(eq(table.id, adminCompanyId));
				} else if (resource === "salespeople" || resource === "teams" || resource === "company_user_roles") {
					// For tables with direct companyId
					filterConditions.push(eq(table[companyColumn], adminCompanyId));
				}
				// Note: interactions and flags would need subqueries which adds complexity
				// For now, those are handled at the frontend level or via joins
			}
		}

		// Parse pagination parameters
		let limit: number | undefined;
		let offset: number | undefined;

		// Support both simple-rest pagination formats
		if (flatParams._start && flatParams._end) {
			// Format: ?_start=0&_end=10
			const start = parseInt(flatParams._start, 10);
			const end = parseInt(flatParams._end, 10);
			if (!Number.isNaN(start) && !Number.isNaN(end) && start >= 0 && end > start) {
				offset = start;
				limit = end - start;
			}
		} else if (flatParams._page && flatParams._limit) {
			// Format: ?_page=1&_limit=10
			const page = parseInt(flatParams._page, 10);
			const pageLimit = parseInt(flatParams._limit, 10);
			if (!Number.isNaN(page) && !Number.isNaN(pageLimit) && page >= 1 && pageLimit > 0) {
				offset = (page - 1) * pageLimit;
				limit = pageLimit;
			}
		}

		// Get total count (with filters applied)
		const countQuery =
			filterConditions.length > 0
				? db
						.select({ count: count() })
						.from(table)
						.where(and(...filterConditions))
				: db.select({ count: count() }).from(table);

		const [{ count: totalCount }] = await countQuery;

		// Build paginated query with optional WHERE clause and pagination
		let query: any;
		if (filterConditions.length > 0) {
			query = db
				.select()
				.from(table)
				.where(and(...filterConditions));
			if (limit !== undefined && offset !== undefined) {
				query = query.limit(limit).offset(offset);
			}
		} else {
			query = db.select().from(table);
			if (limit !== undefined && offset !== undefined) {
				query = query.limit(limit).offset(offset);
			}
		}

		const results = await query;

		// Return results array with X-Total-Count header for Refine simple-rest
		c.header("X-Total-Count", totalCount.toString());
		return c.json(results);
	})
	.get("/:resource/:id", createParamValidator(resourceWithIdSchema, "Invalid resource or ID parameter"), async (c) => {
		const { resource, id } = c.req.valid("param");
		const tables = getAvailableTables();
		const table = tables[resource];

		if (!table) {
			return c.json({ error: "Resource not found" }, 404);
		}

		const result = await db.select().from(table).where(eq(table.id, id)).limit(1);

		if (result.length === 0) {
			return c.json({ error: "Record not found" }, 404);
		}

		// Check company access if admin has a company association
		const adminCompanyId = c.get("adminCompanyId");
		if (adminCompanyId !== null && COMPANY_SCOPED_TABLES.has(resource)) {
			const record = result[0] as any;
			if (resource === "companies" && record.id !== adminCompanyId) {
				return c.json({ error: "Forbidden: No access to this company" }, 403);
			}
			if ((resource === "salespeople" || resource === "teams") && record.companyId !== adminCompanyId) {
				return c.json({ error: "Forbidden: No access to this record" }, 403);
			}
		}

		return c.json(result[0]);
	})
	.post("/:resource", createParamValidator(resourceSchema, "Invalid resource parameter"), async (c) => {
		const { resource } = c.req.valid("param");
		const tables = getAvailableTables();
		const table = tables[resource];

		if (!table) {
			return c.json({ error: "Resource not found" }, 404);
		}

		// Check company access for creates
		const adminCompanyId = c.get("adminCompanyId");

		try {
			const body = await c.req.json();

			// Enforce company restriction on creates
			if (adminCompanyId !== null && COMPANY_SCOPED_TABLES.has(resource)) {
				if (resource === "companies") {
					return c.json({ error: "Forbidden: Cannot create companies" }, 403);
				}
				if ((resource === "salespeople" || resource === "teams") && body.companyId !== adminCompanyId) {
					return c.json({ error: "Forbidden: Can only create records for your company" }, 403);
				}
			}

			const result = (await db.insert(table).values(body).returning()) as any[];
			return c.json(result[0], 201);
		} catch (error) {
			if (error instanceof SyntaxError) {
				return c.json({ error: "Invalid JSON" }, 400);
			}
			logger.error({ error }, "Insert error");
			return c.json({ error: "Failed to create record" }, 400);
		}
	})
	.patch("/:resource/:id", createParamValidator(resourceWithIdSchema, "Invalid resource or ID parameter"), async (c) => {
		const { resource, id } = c.req.valid("param");
		const tables = getAvailableTables();
		const table = tables[resource];

		if (!table) {
			return c.json({ error: "Resource not found" }, 404);
		}

		// Check company access before update
		const adminCompanyId = c.get("adminCompanyId");
		if (adminCompanyId !== null && COMPANY_SCOPED_TABLES.has(resource)) {
			const existing = await db.select().from(table).where(eq(table.id, id)).limit(1);
			if (existing.length > 0) {
				const record = existing[0] as any;
				if (resource === "companies" && record.id !== adminCompanyId) {
					return c.json({ error: "Forbidden: No access to this company" }, 403);
				}
				if ((resource === "salespeople" || resource === "teams") && record.companyId !== adminCompanyId) {
					return c.json({ error: "Forbidden: No access to this record" }, 403);
				}
			}
		}

		try {
			const body = await c.req.json();
			const result = await db.update(table).set(body).where(eq(table.id, id)).returning();

			if (result.length === 0) {
				return c.json({ error: "Record not found" }, 404);
			}

			return c.json(result[0]);
		} catch (error) {
			logger.error({ error }, "Update error");
			return c.json({ error: "Failed to update record" }, 400);
		}
	})
	.delete("/:resource/:id", createParamValidator(resourceWithIdSchema, "Invalid resource or ID parameter"), async (c) => {
		const { resource, id } = c.req.valid("param");
		const tables = getAvailableTables();
		const table = tables[resource];

		if (!table) {
			return c.json({ error: "Resource not found" }, 404);
		}

		// Check company access before delete
		const adminCompanyId = c.get("adminCompanyId");
		if (adminCompanyId !== null && COMPANY_SCOPED_TABLES.has(resource)) {
			const existing = await db.select().from(table).where(eq(table.id, id)).limit(1);
			if (existing.length > 0) {
				const record = existing[0] as any;
				if (resource === "companies" && record.id !== adminCompanyId) {
					return c.json({ error: "Forbidden: No access to this company" }, 403);
				}
				if ((resource === "salespeople" || resource === "teams") && record.companyId !== adminCompanyId) {
					return c.json({ error: "Forbidden: No access to this record" }, 403);
				}
			}
		}

		try {
			const result = (await db.delete(table).where(eq(table.id, id)).returning()) as any[];

			if (result.length === 0) {
				return c.json({ error: "Record not found" }, 404);
			}

			return c.json({ success: true });
		} catch (error) {
			logger.error({ error }, "Delete error");
			return c.json({ error: "Failed to delete record" }, 400);
		}
	});

export default app;
export type AdminRoutes = typeof app;
