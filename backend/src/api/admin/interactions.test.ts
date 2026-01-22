import { describe, test, expect } from "vitest";
import app from "#/index";
import { loginAndGetCookie } from "#/lib/testUtils";

describe("Admin Interactions Routes", () => {
	describe("GET /with-relations", () => {
		test("Should require authentication", async () => {
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=1");
			expect(response.status).toBe(401);
		});

		test("Should require admin role", async () => {
			const cookie = await loginAndGetCookie("bob@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=1", {
				headers: { cookie },
			});
			expect(response.status).toBe(403);
		});

		test("Should validate required salespersonId parameter", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/with-relations", {
				headers: { cookie },
			});
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Invalid query parameters");
		});

		test("Should load interactions with all relations in a single call", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			// Assuming salesperson with ID 1 exists and has interactions (from seed data)
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=1", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			// Verify response structure
			expect(data).toMatchObject({
				data: expect.any(Array),
				total: expect.any(Number),
				page: 1,
				pageSize: 10,
			});

			// If there are interactions, verify they have related data
			if (data.data.length > 0) {
				const firstInteraction = data.data[0];
				expect(firstInteraction).toMatchObject({
					id: expect.any(Number),
					blurb: expect.any(String),
					processedStatus: expect.any(String),
					salespersonId: 1,
					ratings: expect.any(Array),
					flags: expect.any(Array),
					bigfiles: expect.any(Array),
				});
			}
		});

		test("Should support pagination parameters", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=1&page=1&pageSize=5", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			expect(data.page).toBe(1);
			expect(data.pageSize).toBe(5);
			expect(data.data.length).toBeLessThanOrEqual(5);
		});

		test("Should support sorting parameters", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=1&sortBy=createdAt&sortOrder=asc", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			// Verify sorting if we have multiple interactions
			if (data.data.length > 1) {
				const firstDate = new Date(data.data[0].createdAt);
				const secondDate = new Date(data.data[1].createdAt);
				expect(firstDate.getTime()).toBeLessThanOrEqual(secondDate.getTime());
			}
		});

		test("Should handle salesperson with no interactions", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			// Use a very high salesperson ID that likely doesn't exist
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=99999", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			expect(data).toMatchObject({
				data: [],
				total: 0,
				page: 1,
				pageSize: 10,
			});
		});

		test("Should reject invalid page size", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=1&pageSize=200", {
				headers: { cookie },
			});

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe("Invalid query parameters");
		});

		test("Should use default values for optional parameters", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/with-relations?salespersonId=1", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			// Verify defaults are applied
			expect(data.page).toBe(1);
			expect(data.pageSize).toBe(10);
		});
	});

	describe("POST /:id/reset-analysis", () => {
		test("Should require authentication", async () => {
			const response = await app.request("/vantage/api/admin/interactions/1/reset-analysis", {
				method: "POST",
			});
			expect(response.status).toBe(401);
		});

		test("Should require admin role", async () => {
			const cookie = await loginAndGetCookie("bob@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/1/reset-analysis", {
				method: "POST",
				headers: { cookie },
			});
			expect(response.status).toBe(403);
		});

		test("Should validate interaction ID parameter", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/interactions/invalid/reset-analysis", {
				method: "POST",
				headers: { cookie },
			});
			expect(response.status).toBe(400);
		});
	});
});
