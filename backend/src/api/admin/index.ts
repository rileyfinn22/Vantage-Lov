import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { db } from "#/data";
import { eq } from "drizzle-orm";
import * as schema from "#/data/schema";
import crudRoutes from "./crud";
import usersRoutes from "./users";
import interactionsRoutes from "./interactions";
import companyTrainingRoutes from "./company-training";
import feedbackAggregationRoutes from "./feedback-aggregation";
import promptDefaultsRoutes from "./prompt-defaults";

/**
 * Admin routes with authentication middleware
 * All routes under /api/admin require either:
 * - Site admin role (can see all or their company based on association)
 * - Company admin role (can see only their company)
 */
const app = new Hono<AuthVariable<false>>()
	.use("*", async (c, next) => {
		const currentUser = c.get("user");
		if (!currentUser) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Check for site admin role
		const userRoles = await db.select().from(schema.authUserRoles).where(eq(schema.authUserRoles.userId, currentUser.id));
		const isSiteAdmin = userRoles.some((role) => role.role === "admin");

		// Check for company admin role
		const companyRoles = await db.select().from(schema.companyUserRoles).where(eq(schema.companyUserRoles.userId, currentUser.id));
		const isCompanyAdmin = companyRoles.some((role) => role.role === "admin");

		if (!isSiteAdmin && !isCompanyAdmin) {
			return c.json({ error: "Forbidden: Admin access required" }, 403);
		}

		return next();
	})
	.route("/crud", crudRoutes)
	.route("/users", usersRoutes)
	.route("/interactions", interactionsRoutes)
	.route("/company-training", companyTrainingRoutes)
	.route("/feedback-aggregation", feedbackAggregationRoutes)
	.route("/prompt-defaults", promptDefaultsRoutes);

export default app;
export type AdminRoutes = typeof app;
