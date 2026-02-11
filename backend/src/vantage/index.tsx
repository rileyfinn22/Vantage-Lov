import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AuthVariable } from "#/lib/types";
import salespeopleRoutes from "#/api/salespeople/routes";
import adminRoutes from "#/api/admin";
import dashboardRoutes from "#/api/dashboard/routes";
import uploadRoutes from "#/api/upload/routes";
import insightsRoutes from "#/api/insights/routes";
import notificationsRoutes from "#/api/notifications/routes";
import trainingRoutes from "#/api/training/routes";
import flagsRoutes from "#/api/flags/routes";
import promptDefaultsRoutes from "#/api/admin/prompt-defaults";
import battleCardsRoutes from "#/api/battle-cards/routes";
import agenticRoutes from "#/api/agentic/routes";
import meetingPrepRoutes from "#/api/meeting-prep/routes";
import crmRoutes from "#/api/crm/routes";
import { myUserHandler, healthHandler } from "#/handlers/api";
import { logger } from "#/lib/logger";

const app = new Hono<AuthVariable<false>>()
	.use(
		cors({
			origin: (origin) => {
				// In development/test, allow localhost on any port
				if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
					if (origin.startsWith("https://localhost:") || origin.startsWith("http://localhost:")) {
						return origin;
					}
				}

				// Check against configured host
				if (process.env.HOST && origin === `https://${process.env.HOST}`) {
					return origin;
				}

				// Check against additional trusted origins (comma-separated)
				if (process.env.TRUSTED_ORIGINS) {
					const trustedOrigins = process.env.TRUSTED_ORIGINS.split(",").map((o) => o.trim());
					if (trustedOrigins.includes(origin)) {
						return origin;
					}
				}

				// Deny by default
				return "";
			},
			allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
			credentials: true,
		}),
	)
	.get("/health", healthHandler)
	.get("/api/myuser", myUserHandler)
	.route("/api/page/dashboard", dashboardRoutes)
	.route("/api/salespeople", salespeopleRoutes)
	.route("/api/admin", adminRoutes)
	.route("/api/prompt-defaults", promptDefaultsRoutes)
	.route("/api/upload", uploadRoutes)
	.route("/api/insights", insightsRoutes)
	.route("/api/notifications", notificationsRoutes)
	.route("/api/training", trainingRoutes)
	.route("/api/flags", flagsRoutes)
	.route("/api/battle-cards", battleCardsRoutes)
	.route("/api/agentic", agenticRoutes)
	.route("/api/meeting-prep", meetingPrepRoutes)
	.route("/api/crm", crmRoutes);

export default app;
