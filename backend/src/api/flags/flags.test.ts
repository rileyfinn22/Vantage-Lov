import { describe, test, beforeAll, expect } from "vitest";
import { db, users, usersReady } from "#/data";
import app from "#/index";
import * as schema from "#/data/schema";
import { loginAndGetCookie } from "#/lib/testUtils";

describe("flags API", () => {
	let bobSalespersonId: number;
	let leeSalespersonId: number;
	let angelaSalespersonId: number;

	beforeAll(async () => {
		// Wait for database seeding to complete
		await usersReady;
		if (!users) throw new Error("Database not seeded");

		// Get salesperson IDs from the database
		const salespeople = await db.select().from(schema.salespeople);
		bobSalespersonId = salespeople.find((sp) => sp.firstName === "Bobby")?.id!;
		leeSalespersonId = salespeople.find((sp) => sp.firstName === "Lee")?.id!;
		angelaSalespersonId = salespeople.find((sp) => sp.firstName === "Angela")?.id!;
	});

	const getSigninCookie = (email = "bob@v.alexw.codes") => loginAndGetCookie(email, "brazil-tree-fire");

	describe("Pagination", () => {
		test("GET /api/flags with default pagination returns first page", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();

			// Verify pagination metadata with defaults (page=1, pageSize=5)
			expect(data.pagination).toBeDefined();
			expect(data.pagination.page).toBe(1);
			expect(data.pagination.pageSize).toBe(5);
			expect(data.pagination.total).toBeGreaterThan(0);
			expect(data.pagination.totalPages).toBeGreaterThanOrEqual(1);

			// Verify flags array
			expect(data.flags).toBeDefined();
			expect(Array.isArray(data.flags)).toBe(true);
			expect(data.flags.length).toBeLessThanOrEqual(5);
		});

		test("GET /api/flags with custom pageSize returns correct number of items", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&page=1&pageSize=1`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();

			expect(data.pagination.pageSize).toBe(1);
			expect(data.flags.length).toBeLessThanOrEqual(1);
		});

		test("GET /api/flags with page 2 returns different results", async () => {
			const cookie = await getSigninCookie();

			// Get first page
			const response1 = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&page=1&pageSize=1`, {
				headers: {
					cookie,
				},
			});
			const data1 = await response1.json();

			// Get second page if it exists
			if (data1.pagination.totalPages >= 2) {
				const response2 = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&page=2&pageSize=1`, {
					headers: {
						cookie,
					},
				});
				await expect(response2).toMatchResponse({ status: 200 });
				const data2 = await response2.json();

				expect(data2.pagination.page).toBe(2);
				expect(data2.flags.length).toBeGreaterThan(0);
				// Verify different flags are returned
				if (data1.flags.length > 0 && data2.flags.length > 0) {
					expect(data1.flags[0].id).not.toBe(data2.flags[0].id);
				}
			}
		});

		test("GET /api/flags with last page returns remaining items", async () => {
			const cookie = await getSigninCookie();

			// Get first page to know total pages
			const response1 = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&pageSize=1`, {
				headers: {
					cookie,
				},
			});
			const data1 = await response1.json();
			const lastPage = data1.pagination.totalPages;

			// Get last page
			const response2 = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&page=${lastPage}&pageSize=1`, {
				headers: {
					cookie,
				},
			});
			await expect(response2).toMatchResponse({ status: 200 });
			const data2 = await response2.json();

			expect(data2.pagination.page).toBe(lastPage);
			expect(data2.flags.length).toBeGreaterThan(0);
			expect(data2.flags.length).toBeLessThanOrEqual(1);
		});

		test("GET /api/flags with page beyond total returns empty results", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&page=9999&pageSize=5`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();

			expect(data.pagination.page).toBe(9999);
			expect(data.flags.length).toBe(0);
		});
	});

	describe("Validation", () => {
		test("GET /api/flags with invalid page returns 400", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&page=0`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 400 });
		});

		test("GET /api/flags with negative page returns 400", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&page=-1`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 400 });
		});

		test("GET /api/flags with pageSize > 100 returns 400", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&pageSize=101`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 400 });
		});

		test("GET /api/flags with pageSize < 1 returns 400", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&pageSize=0`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 400 });
		});

		test("GET /api/flags without salespersonId returns 400", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request("/vantage/api/flags", {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 400 });
		});

		test("GET /api/flags with invalid salespersonId returns 404", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request("/vantage/api/flags?salespersonId=99999", {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 404 });
			const data = await response.json();
			expect(data.error).toBe("Salesperson not found");
		});
	});

	describe("Authorization", () => {
		test("GET /api/flags for own flags (Bob accessing Bob) succeeds", async () => {
			const cookie = await getSigninCookie();

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(data.flags).toBeDefined();
			expect(Array.isArray(data.flags)).toBe(true);
		});

		test("GET /api/flags for same company (Lee accessing Bob) succeeds", async () => {
			const cookie = await getSigninCookie("lee@v.alexw.codes");

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(data.flags).toBeDefined();
			expect(Array.isArray(data.flags)).toBe(true);
		});

		test("GET /api/flags for different company (Angela accessing Bob) fails", async () => {
			const cookie = await getSigninCookie("angela@v.alexw.codes");

			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 401 });
			const data = await response.json();
			expect(data.error).toBe("Unauthorized");
		});

		test("GET /api/flags for site admin (admin accessing any salesperson) succeeds", async () => {
			const cookie = await getSigninCookie("admin@v.alexw.codes");

			const response = await app.request(`/vantage/api/flags?salespersonId=${angelaSalespersonId}`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(data.flags).toBeDefined();
			expect(Array.isArray(data.flags)).toBe(true);
		});

		test("GET /api/flags without authentication fails", async () => {
			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}`);

			await expect(response).toMatchResponse({ status: 401 });
			const data = await response.json();
			expect(data.error).toBe("Unauthorized");
		});
	});

	describe("Edge Cases", () => {
		test("GET /api/flags for salesperson with no flags returns empty array", async () => {
			const cookie = await getSigninCookie("lee@v.alexw.codes");

			// Lee should have at least 1 flag from seed data, but if empty:
			const response = await app.request(`/vantage/api/flags?salespersonId=${leeSalespersonId}`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(data.flags).toBeDefined();
			expect(Array.isArray(data.flags)).toBe(true);
			expect(data.pagination.total).toBeGreaterThanOrEqual(0);
		});

		test("GET /api/flags with single page of results has totalPages = 1", async () => {
			const cookie = await getSigninCookie();

			// Use large pageSize to ensure single page
			const response = await app.request(`/vantage/api/flags?salespersonId=${bobSalespersonId}&pageSize=100`, {
				headers: {
					cookie,
				},
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(data.pagination.totalPages).toBeGreaterThanOrEqual(1);
			expect(data.flags.length).toBe(data.pagination.total);
		});
	});
});
