import { logger } from "#/lib/logger";

// HubSpot API Configuration
const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const HUBSPOT_API_BASE = "https://api.hubapi.com";

// Required scopes for read-only access
const HUBSPOT_SCOPES = [
	"crm.objects.contacts.read",
	"crm.objects.companies.read",
	"crm.objects.deals.read",
	"crm.objects.owners.read",
].join(" ");

export interface HubSpotTokens {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	expiresAt: Date;
}

export interface HubSpotContact {
	id: string;
	properties: {
		email?: string;
		firstname?: string;
		lastname?: string;
		phone?: string;
		jobtitle?: string;
		company?: string;
		lifecyclestage?: string;
		lastmodifieddate?: string;
	};
}

export interface HubSpotCompany {
	id: string;
	properties: {
		name?: string;
		domain?: string;
		industry?: string;
		numberofemployees?: string;
		annualrevenue?: string;
		city?: string;
		state?: string;
		country?: string;
	};
}

export interface HubSpotDeal {
	id: string;
	properties: {
		dealname?: string;
		amount?: string;
		dealstage?: string;
		closedate?: string;
		pipeline?: string;
		hubspot_owner_id?: string;
	};
}

export interface HubSpotAccountInfo {
	portalId: number;
	accountType: string;
	timeZone: string;
	currency: string;
	utcOffset: string;
	utcOffsetMilliseconds: number;
}

export class HubSpotService {
	// Read env vars lazily to ensure dotenv has loaded them
	private get clientId(): string {
		return process.env.HUBSPOT_CLIENT_ID ?? "";
	}

	private get clientSecret(): string {
		return process.env.HUBSPOT_CLIENT_SECRET ?? "";
	}

	private get redirectUri(): string {
		return process.env.HUBSPOT_REDIRECT_URI ?? "";
	}

	isConfigured(): boolean {
		return !!(this.clientId && this.clientSecret);
	}

	/**
	 * Generate OAuth authorization URL
	 */
	getAuthorizationUrl(state: string): string {
		const params = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			scope: HUBSPOT_SCOPES,
			state: state,
		});

		return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
	}

	/**
	 * Exchange authorization code for tokens
	 */
	async exchangeCodeForTokens(code: string): Promise<HubSpotTokens> {
		const response = await fetch(HUBSPOT_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				client_id: this.clientId,
				client_secret: this.clientSecret,
				redirect_uri: this.redirectUri,
				code: code,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			logger.error({ error, status: response.status }, "Failed to exchange HubSpot code for tokens");
			throw new Error(`Failed to exchange code: ${error}`);
		}

		const data = await response.json();
		const expiresAt = new Date(Date.now() + data.expires_in * 1000);

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresIn: data.expires_in,
			expiresAt,
		};
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshAccessToken(refreshToken: string): Promise<HubSpotTokens> {
		const response = await fetch(HUBSPOT_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				grant_type: "refresh_token",
				client_id: this.clientId,
				client_secret: this.clientSecret,
				refresh_token: refreshToken,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			logger.error({ error, status: response.status }, "Failed to refresh HubSpot token");
			throw new Error(`Failed to refresh token: ${error}`);
		}

		const data = await response.json();
		const expiresAt = new Date(Date.now() + data.expires_in * 1000);

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresIn: data.expires_in,
			expiresAt,
		};
	}

	/**
	 * Get HubSpot account info
	 */
	async getAccountInfo(accessToken: string): Promise<HubSpotAccountInfo> {
		const response = await fetch(`${HUBSPOT_API_BASE}/account-info/v3/details`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get account info: ${error}`);
		}

		return response.json();
	}

	/**
	 * Get access token info (includes user email)
	 */
	async getTokenInfo(accessToken: string): Promise<{ user: string; hub_id: number; app_id: number }> {
		const response = await fetch(`${HUBSPOT_API_BASE}/oauth/v1/access-tokens/${accessToken}`);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get token info: ${error}`);
		}

		return response.json();
	}

	/**
	 * Fetch contacts from HubSpot
	 */
	async getContacts(accessToken: string, limit = 100): Promise<{ results: HubSpotContact[]; total: number }> {
		const properties = ["email", "firstname", "lastname", "phone", "jobtitle", "company", "lifecyclestage", "lastmodifieddate"];

		const response = await fetch(
			`${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=${limit}&properties=${properties.join(",")}`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get contacts: ${error}`);
		}

		const data = await response.json();
		return {
			results: data.results || [],
			total: data.total || 0,
		};
	}

	/**
	 * Fetch companies from HubSpot
	 */
	async getCompanies(accessToken: string, limit = 100): Promise<{ results: HubSpotCompany[]; total: number }> {
		const properties = ["name", "domain", "industry", "numberofemployees", "annualrevenue", "city", "state", "country"];

		const response = await fetch(
			`${HUBSPOT_API_BASE}/crm/v3/objects/companies?limit=${limit}&properties=${properties.join(",")}`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get companies: ${error}`);
		}

		const data = await response.json();
		return {
			results: data.results || [],
			total: data.total || 0,
		};
	}

	/**
	 * Fetch deals from HubSpot
	 */
	async getDeals(accessToken: string, limit = 100): Promise<{ results: HubSpotDeal[]; total: number }> {
		const properties = ["dealname", "amount", "dealstage", "closedate", "pipeline", "hubspot_owner_id"];

		const response = await fetch(
			`${HUBSPOT_API_BASE}/crm/v3/objects/deals?limit=${limit}&properties=${properties.join(",")}`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get deals: ${error}`);
		}

		const data = await response.json();
		return {
			results: data.results || [],
			total: data.total || 0,
		};
	}

	/**
	 * Search for a contact by email
	 */
	async searchContactByEmail(accessToken: string, email: string): Promise<HubSpotContact | null> {
		const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts/search`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				filterGroups: [
					{
						filters: [
							{
								propertyName: "email",
								operator: "EQ",
								value: email,
							},
						],
					},
				],
				properties: ["email", "firstname", "lastname", "phone", "jobtitle", "company", "lifecyclestage"],
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to search contacts: ${error}`);
		}

		const data = await response.json();
		return data.results?.[0] || null;
	}

	/**
	 * Get all data summary (for sync status)
	 */
	async getDataSummary(accessToken: string): Promise<{ contacts: number; companies: number; deals: number }> {
		// Use search API to get totals (list API doesn't return total counts)
		const searchBody = JSON.stringify({ filterGroups: [], limit: 1 });
		const headers = {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		};

		const [contactsRes, companiesRes, dealsRes] = await Promise.all([
			fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts/search`, {
				method: "POST",
				headers,
				body: searchBody,
			}),
			fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/companies/search`, {
				method: "POST",
				headers,
				body: searchBody,
			}),
			fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/deals/search`, {
				method: "POST",
				headers,
				body: searchBody,
			}),
		]);

		const [contacts, companies, deals] = await Promise.all([
			contactsRes.ok ? contactsRes.json() : { total: 0 },
			companiesRes.ok ? companiesRes.json() : { total: 0 },
			dealsRes.ok ? dealsRes.json() : { total: 0 },
		]);

		return {
			contacts: contacts.total ?? 0,
			companies: companies.total ?? 0,
			deals: deals.total ?? 0,
		};
	}
}

// Export singleton instance
export const hubspotService = new HubSpotService();
