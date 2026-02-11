import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "#/data";
import { crmConnections } from "#/data/schema";
import { eq, and } from "drizzle-orm";
import { getUserCompanyId } from "#/middleware/authorization";
import { requireAuth } from "#/middleware/auth";
import { logger } from "#/lib/logger";
import { hubspotService } from "#/services/HubSpotService";
import { randomBytes } from "crypto";

// Store OAuth state temporarily (in production, use Redis or DB)
const oauthStates = new Map<string, { companyId: number; expiresAt: number }>();

// Clean up expired states every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [state, data] of oauthStates.entries()) {
		if (data.expiresAt < now) {
			oauthStates.delete(state);
		}
	}
}, 5 * 60 * 1000);

const app = new Hono<AuthVariable<false>>()
	// Get current CRM connection status
	.get("/status", requireAuth, async (c) => {
		const currentUser = c.get("user");

		try {
			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ connections: [] });
			}

			const connections = await db
				.select({
					id: crmConnections.id,
					provider: crmConnections.provider,
					status: crmConnections.status,
					providerAccountName: crmConnections.providerAccountName,
					connectedUserEmail: crmConnections.connectedUserEmail,
					lastSyncAt: crmConnections.lastSyncAt,
					contactsCount: crmConnections.contactsCount,
					companiesCount: crmConnections.companiesCount,
					dealsCount: crmConnections.dealsCount,
					createdAt: crmConnections.createdAt,
				})
				.from(crmConnections)
				.where(eq(crmConnections.companyId, companyId));

			return c.json({ connections });
		} catch (error) {
			logger.error({ error }, "Failed to get CRM status");
			return c.json({ error: "Failed to get CRM status" }, 500);
		}
	})

	// Initiate HubSpot OAuth flow
	.get("/hubspot/connect", requireAuth, async (c) => {
		const currentUser = c.get("user");

		try {
			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ error: "No company associated with user" }, 400);
			}

			// Generate OAuth state
			const state = randomBytes(32).toString("hex");
			oauthStates.set(state, {
				companyId,
				expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
			});

			const authUrl = hubspotService.getAuthorizationUrl(state);

			logger.info({ companyId }, "Initiating HubSpot OAuth");

			return c.json({ authUrl });
		} catch (error) {
			logger.error({ error }, "Failed to initiate HubSpot OAuth");
			return c.json({ error: "Failed to initiate OAuth" }, 500);
		}
	})

	// HubSpot OAuth callback
	.get("/hubspot/callback", async (c) => {
		const code = c.req.query("code");
		const state = c.req.query("state");
		const error = c.req.query("error");

		// Handle user denial
		if (error) {
			logger.warn({ error }, "HubSpot OAuth denied");
			return c.redirect("/settings?crm_error=denied");
		}

		if (!code || !state) {
			logger.warn("Missing code or state in HubSpot callback");
			return c.redirect("/settings?crm_error=invalid_request");
		}

		// Validate state
		const stateData = oauthStates.get(state);
		if (!stateData) {
			logger.warn("Invalid or expired OAuth state");
			return c.redirect("/settings?crm_error=invalid_state");
		}

		// Clean up state
		oauthStates.delete(state);

		// Check if expired
		if (stateData.expiresAt < Date.now()) {
			logger.warn("Expired OAuth state");
			return c.redirect("/settings?crm_error=expired");
		}

		try {
			// Exchange code for tokens
			const tokens = await hubspotService.exchangeCodeForTokens(code);

			// Get account info
			const [accountInfo, tokenInfo] = await Promise.all([
				hubspotService.getAccountInfo(tokens.accessToken),
				hubspotService.getTokenInfo(tokens.accessToken),
			]);

			// Get data counts
			const dataSummary = await hubspotService.getDataSummary(tokens.accessToken);

			// Check for existing connection
			const existing = await db
				.select()
				.from(crmConnections)
				.where(and(eq(crmConnections.companyId, stateData.companyId), eq(crmConnections.provider, "hubspot")))
				.limit(1);

			if (existing.length > 0) {
				// Update existing connection
				await db
					.update(crmConnections)
					.set({
						accessToken: tokens.accessToken,
						refreshToken: tokens.refreshToken,
						tokenExpiresAt: tokens.expiresAt,
						providerAccountId: String(accountInfo.portalId),
						providerAccountName: tokenInfo.user,
						connectedUserEmail: tokenInfo.user,
						status: "connected",
						lastSyncAt: new Date(),
						syncError: null,
						contactsCount: dataSummary.contacts,
						companiesCount: dataSummary.companies,
						dealsCount: dataSummary.deals,
						updatedAt: new Date(),
					})
					.where(eq(crmConnections.id, existing[0].id));

				logger.info({ companyId: stateData.companyId, hubId: accountInfo.portalId }, "Updated HubSpot connection");
			} else {
				// Create new connection
				await db.insert(crmConnections).values({
					companyId: stateData.companyId,
					provider: "hubspot",
					accessToken: tokens.accessToken,
					refreshToken: tokens.refreshToken,
					tokenExpiresAt: tokens.expiresAt,
					providerAccountId: String(accountInfo.portalId),
					providerAccountName: tokenInfo.user,
					connectedUserEmail: tokenInfo.user,
					status: "connected",
					lastSyncAt: new Date(),
					contactsCount: dataSummary.contacts,
					companiesCount: dataSummary.companies,
					dealsCount: dataSummary.deals,
				});

				logger.info({ companyId: stateData.companyId, hubId: accountInfo.portalId }, "Created HubSpot connection");
			}

			return c.redirect("/settings?crm_success=hubspot");
		} catch (err) {
			logger.error({ error: err }, "Failed to complete HubSpot OAuth");
			return c.redirect("/settings?crm_error=token_exchange_failed");
		}
	})

	// Disconnect HubSpot
	.delete("/hubspot", requireAuth, async (c) => {
		const currentUser = c.get("user");

		try {
			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ error: "No company associated with user" }, 400);
			}

			await db
				.delete(crmConnections)
				.where(and(eq(crmConnections.companyId, companyId), eq(crmConnections.provider, "hubspot")));

			logger.info({ companyId }, "Disconnected HubSpot");

			return c.json({ success: true });
		} catch (error) {
			logger.error({ error }, "Failed to disconnect HubSpot");
			return c.json({ error: "Failed to disconnect" }, 500);
		}
	})

	// Get HubSpot data (read-only)
	.get("/hubspot/contacts", requireAuth, async (c) => {
		const currentUser = c.get("user");
		const limit = parseInt(c.req.query("limit") ?? "100", 10);

		try {
			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ error: "No company associated with user" }, 400);
			}

			const connection = await db
				.select()
				.from(crmConnections)
				.where(and(eq(crmConnections.companyId, companyId), eq(crmConnections.provider, "hubspot")))
				.limit(1);

			if (connection.length === 0) {
				return c.json({ error: "HubSpot not connected" }, 404);
			}

			const contacts = await hubspotService.getContacts(connection[0].accessToken, limit);

			return c.json(contacts);
		} catch (error) {
			logger.error({ error }, "Failed to get HubSpot contacts");
			return c.json({ error: "Failed to get contacts" }, 500);
		}
	})

	.get("/hubspot/companies", requireAuth, async (c) => {
		const currentUser = c.get("user");
		const limit = parseInt(c.req.query("limit") ?? "100", 10);

		try {
			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ error: "No company associated with user" }, 400);
			}

			const connection = await db
				.select()
				.from(crmConnections)
				.where(and(eq(crmConnections.companyId, companyId), eq(crmConnections.provider, "hubspot")))
				.limit(1);

			if (connection.length === 0) {
				return c.json({ error: "HubSpot not connected" }, 404);
			}

			const companies = await hubspotService.getCompanies(connection[0].accessToken, limit);

			return c.json(companies);
		} catch (error) {
			logger.error({ error }, "Failed to get HubSpot companies");
			return c.json({ error: "Failed to get companies" }, 500);
		}
	})

	.get("/hubspot/deals", requireAuth, async (c) => {
		const currentUser = c.get("user");
		const limit = parseInt(c.req.query("limit") ?? "100", 10);

		try {
			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ error: "No company associated with user" }, 400);
			}

			const connection = await db
				.select()
				.from(crmConnections)
				.where(and(eq(crmConnections.companyId, companyId), eq(crmConnections.provider, "hubspot")))
				.limit(1);

			if (connection.length === 0) {
				return c.json({ error: "HubSpot not connected" }, 404);
			}

			const deals = await hubspotService.getDeals(connection[0].accessToken, limit);

			return c.json(deals);
		} catch (error) {
			logger.error({ error }, "Failed to get HubSpot deals");
			return c.json({ error: "Failed to get deals" }, 500);
		}
	})

	// Search contact by email (useful for meeting prep)
	.get(
		"/hubspot/contacts/search",
		requireAuth,
		zValidator("query", z.object({ email: z.string().email() })),
		async (c) => {
			const currentUser = c.get("user");
			const { email } = c.req.valid("query");

			try {
				const companyId = await getUserCompanyId(currentUser.id);
				if (!companyId) {
					return c.json({ error: "No company associated with user" }, 400);
				}

				const connection = await db
					.select()
					.from(crmConnections)
					.where(and(eq(crmConnections.companyId, companyId), eq(crmConnections.provider, "hubspot")))
					.limit(1);

				if (connection.length === 0) {
					return c.json({ error: "HubSpot not connected" }, 404);
				}

				const contact = await hubspotService.searchContactByEmail(connection[0].accessToken, email);

				return c.json({ contact });
			} catch (error) {
				logger.error({ error }, "Failed to search HubSpot contacts");
				return c.json({ error: "Failed to search contacts" }, 500);
			}
		}
	)

	// Manual sync trigger
	.post("/hubspot/sync", requireAuth, async (c) => {
		const currentUser = c.get("user");

		try {
			const companyId = await getUserCompanyId(currentUser.id);
			if (!companyId) {
				return c.json({ error: "No company associated with user" }, 400);
			}

			const connection = await db
				.select()
				.from(crmConnections)
				.where(and(eq(crmConnections.companyId, companyId), eq(crmConnections.provider, "hubspot")))
				.limit(1);

			if (connection.length === 0) {
				return c.json({ error: "HubSpot not connected" }, 404);
			}

			// Get fresh data counts
			const dataSummary = await hubspotService.getDataSummary(connection[0].accessToken);

			// Update sync status
			await db
				.update(crmConnections)
				.set({
					lastSyncAt: new Date(),
					contactsCount: dataSummary.contacts,
					companiesCount: dataSummary.companies,
					dealsCount: dataSummary.deals,
					syncError: null,
					updatedAt: new Date(),
				})
				.where(eq(crmConnections.id, connection[0].id));

			logger.info({ companyId, ...dataSummary }, "Manual HubSpot sync completed");

			return c.json({ success: true, ...dataSummary });
		} catch (error) {
			logger.error({ error }, "Failed to sync HubSpot");
			return c.json({ error: "Failed to sync" }, 500);
		}
	});

export default app;
