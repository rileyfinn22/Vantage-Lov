import { describe, test, expect } from "vitest";
import app from "#/index";
import { loginAndGetCookie } from "#/lib/testUtils";

describe("Admin Routes", () => {
	describe("Authentication & Authorization", () => {
		test("Should deny access without authentication", async () => {
			const response = await app.request("/vantage/api/admin/crud/tables");
			await expect(response).toMatchResponse({ status: 401 });
			const data = await response.json();
			expect(data).toMatchObject({ error: "Unauthorized" });
		});

		test("Should deny access to non-admin users", async () => {
			const cookie = await loginAndGetCookie("bob@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/crud/tables", {
				headers: { cookie },
			});

			await expect(response).toMatchResponse({ status: 403 });
			const data = await response.json();
			expect(data).toMatchObject({ error: "Forbidden: Admin access required" });
		});

		test("Should allow access to admin users", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/crud/tables", {
				headers: { cookie },
			});

			await expect(response).toMatchResponse({ status: 200 });
		});
	});

	describe("Tables Endpoint", () => {
		test("Should list available database tables", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/crud/tables", {
				headers: { cookie },
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(data).toMatchObject({
				tables: expect.arrayContaining(["company", "salespeople", "user"]),
			});
			expect(data.tables).toBeInstanceOf(Array);
		});
	});

	describe("CRUD Operations - Company Resource", () => {
		describe("getList (GET /:resource)", () => {
			test("Should list companies with basic request", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const response = await app.request("/vantage/api/admin/crud/company", {
					headers: { cookie },
				});

				await expect(response).toMatchResponse({ status: 200 });
				const data = await response.json();
				expect(Array.isArray(data)).toBe(true);
				expect(data.length).toBeGreaterThan(0);
				expect(data[0]).toMatchObject({
					id: expect.anything(),
					name: expect.anything(),
				});
			});

			test("Should validate resource parameter with zod validator", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");

				// Test with empty string resource parameter
				const emptyResourceResponse = await app.request("/vantage/api/admin/crud/232", {
					headers: { cookie },
				});

				expect(emptyResourceResponse).toMatchObject({
					status: expect.toBeOneOf([400, 404]),
				});

				// This should either be caught by routing (404) or zod validation (400)
				// expect([400, 404]).toContain(emptyResourceResponse.status);
			});

			test("Should handle resource parameter validation errors", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");

				// Test with a resource that doesn't exist but passes zod validation
				const response = await app.request("/vantage/api/admin/crud/nonexistentresource", {
					headers: { cookie },
				});

				expect(response.status).toBe(404);
				const data = await response.json();
				expect(data.error).toBe("Resource not found");
			});

			test("Should accept valid resource parameter", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");

				// Test with valid resource that passes zod validation
				const response = await app.request("/vantage/api/admin/crud/company", {
					headers: { cookie },
				});

				await expect(response).toMatchResponse({ status: 200 });
				const data = await response.json();
				expect(Array.isArray(data)).toBe(true);
			});
		});

		describe("getOne (GET /:resource/:id)", () => {
			test("Should retrieve specific company by ID", async () => {
				// First get the list to find a valid ID
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const listResponse = await app.request("/vantage/api/admin/crud/company", {
					headers: { cookie },
				});
				const companies = await listResponse.json();
				const companyId = companies[0].id;

				const response = await app.request(`/vantage/api/admin/crud/company/${companyId}`, {
					headers: { cookie },
				});

				await expect(response).toMatchResponse({ status: 200 });
				const data = await response.json();
				expect(data).toMatchObject({
					id: companyId,
					name: expect.anything(),
				});
			});

			test("Should return 404 for non-existent company", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const response = await app.request("/vantage/api/admin/crud/company/99999", {
					headers: { cookie },
				});

				await expect(response).toMatchResponse({ status: 404 });
				const data = await response.json();
				expect(data).toMatchObject({ error: "Record not found" });
			});
		});

		describe("create (POST /:resource)", () => {
			test("Should create new company", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const newCompany = {
					name: "Test Company Inc",
					revenueGoal: "100000.00",
				};

				const response = await app.request("/vantage/api/admin/crud/company", {
					method: "POST",
					headers: {
						cookie,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(newCompany),
				});

				await expect(response).toMatchResponse({ status: 201 });
				const data = await response.json();
				expect(data).toMatchObject({
					id: expect.anything(),
					name: "Test Company Inc",
					revenueGoal: "100000.00",
					createdAt: expect.anything(),
				});

				// Verify the created record can be retrieved via GET
				const getResponse = await app.request(`/vantage/api/admin/crud/company/${data.id}`, {
					headers: { cookie },
				});

				await expect(getResponse).toMatchResponse({ status: 200 });
				const retrievedData = await getResponse.json();
				expect(retrievedData).toMatchObject({
					id: data.id,
					name: "Test Company Inc",
					revenueGoal: "100000.00",
					createdAt: expect.anything(),
				});
			});

			test("Should handle invalid data gracefully", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const invalidData = {
					// Missing required name field
					revenueGoal: "100000.00",
				};

				const response = await app.request("/vantage/api/admin/crud/company", {
					method: "POST",
					headers: {
						cookie,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(invalidData),
				});

				await expect(response).toMatchResponse({ status: 400 });
				const data = await response.json();
				expect(data).toMatchObject({ error: "Failed to create record" });
			});
		});

		describe("update (PATCH /:resource/:id)", () => {
			test("Should update existing company", async () => {
				// First create a company to update
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const createResponse = await app.request("/vantage/api/admin/crud/company", {
					method: "POST",
					headers: {
						cookie,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: "Original Name" }),
				});
				const created = await createResponse.json();

				// Now update it
				const updateData = { name: "Updated Company Name" };
				const response = await app.request(`/vantage/api/admin/crud/company/${created.id}`, {
					method: "PATCH",
					headers: {
						cookie,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(updateData),
				});

				await expect(response).toMatchResponse({ status: 200 });
				const data = await response.json();
				expect(data).toMatchObject({
					id: created.id,
					name: "Updated Company Name",
				});

				// Verify the updated record can be retrieved via GET
				const getResponse = await app.request(`/vantage/api/admin/crud/company/${created.id}`, {
					headers: { cookie },
				});

				await expect(getResponse).toMatchResponse({ status: 200 });
				const retrievedData = await getResponse.json();
				expect(retrievedData).toMatchObject({
					id: created.id,
					name: "Updated Company Name",
				});
			});

			test("Should return 404 for non-existent company update", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const updateData = { name: "Updated Name" };

				const response = await app.request("/vantage/api/admin/crud/company/99999", {
					method: "PATCH",
					headers: {
						cookie,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(updateData),
				});

				await expect(response).toMatchResponse({ status: 404 });
				const data = await response.json();
				expect(data).toMatchObject({ error: "Record not found" });
			});
		});

		describe("deleteOne (DELETE /:resource/:id)", () => {
			test("Should delete existing company", async () => {
				// First create a company to delete
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const createResponse = await app.request("/vantage/api/admin/crud/company", {
					method: "POST",
					headers: {
						cookie,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: "Company to Delete" }),
				});
				const created = await createResponse.json();

				// Now delete it
				const response = await app.request(`/vantage/api/admin/crud/company/${created.id}`, {
					method: "DELETE",
					headers: { cookie },
				});

				await expect(response).toMatchResponse({ status: 200 });
				const data = await response.json();
				expect(data).toEqual({ success: true });

				// Verify it's actually deleted
				const getResponse = await app.request(`/vantage/api/admin/crud/company/${created.id}`, {
					headers: { cookie },
				});
				await expect(getResponse).toMatchResponse({ status: 404 });
			});

			test("Should return 404 for non-existent company deletion", async () => {
				const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
				const response = await app.request("/vantage/api/admin/crud/company/99999", {
					method: "DELETE",
					headers: { cookie },
				});

				await expect(response).toMatchResponse({ status: 404 });
				const data = await response.json();
				expect(data).toMatchObject({ error: "Record not found" });
			});
		});
	});

	describe("Error Cases", () => {
		test("Should return 404 for invalid resource", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/crud/nonexistent", {
				headers: { cookie },
			});

			await expect(response).toMatchResponse({ status: 404 });
			const data = await response.json();
			expect(data).toMatchObject({ error: "Resource not found" });
		});

		test("Should handle invalid JSON in POST request", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/crud/company", {
				method: "POST",
				headers: {
					cookie,
					"Content-Type": "application/json",
				},
				body: "invalid json{",
			});

			await expect(response).toMatchResponse({ status: 400 });
		});

		test("Should handle invalid ID format", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/admin/crud/company/invalid-id", {
				headers: { cookie },
			});

			// Should still try to convert to int and fail gracefully
			await expect(response).toMatchResponse({
				status: expect.toBeOneOf([400, 404]),
			});
		});
	});

	describe("Filter Support", () => {
		test("Should filter salespeople by company using eq operator", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");

			// First get companies to find Bob's Widgets company ID
			const companiesResponse = await app.request("/vantage/api/admin/crud/company", {
				headers: { cookie },
			});
			const companies = await companiesResponse.json();
			const bobWidgetsCompany = companies.find((c: any) => c.name === "Bob's Widgets");
			expect(bobWidgetsCompany).toBeDefined();

			// Filter salespeople by Bob's Widgets company ID
			const response = await app.request(`/vantage/api/admin/crud/salespeople?companyId=${bobWidgetsCompany.id}`, {
				headers: { cookie },
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data).toHaveLength(3); // Bob, Lee, and Admin belong to Bob's Widgets

			// Verify the returned salespeople belong to the correct company
			const firstNames = data.map((sp: any) => sp.firstName).sort();
			expect(firstNames).toEqual(["Admin", "Bobby", "Lee"]);

			// Verify all returned salespeople have the correct companyId
			data.forEach((sp: any) => {
				expect(sp.companyId).toBe(bobWidgetsCompany.id);
			});
		});

		test("Should filter salespeople by firstName using contains operator", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");

			// Filter salespeople where firstName contains "Bo"
			const response = await app.request("/vantage/api/admin/crud/salespeople?firstName_like=Bo", {
				headers: { cookie },
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data).toHaveLength(1); // Only Bobby matches

			// Verify the returned salesperson
			expect(data[0]).toMatchObject({
				firstName: "Bobby",
				lastName: "Smith",
			});
		});

		test("Should combine multiple filters with AND logic", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");

			// First get companies to find Bob's Widgets company ID
			const companiesResponse = await app.request("/vantage/api/admin/crud/company", {
				headers: { cookie },
			});
			const companies = await companiesResponse.json();
			const bobWidgetsCompany = companies.find((c: any) => c.name === "Bob's Widgets");

			// Filter salespeople by company AND firstName contains "Lee"
			const response = await app.request(`/vantage/api/admin/crud/salespeople?companyId=${bobWidgetsCompany.id}&firstName_like=Lee`, {
				headers: { cookie },
			});

			await expect(response).toMatchResponse({ status: 200 });
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data).toHaveLength(1); // Only Lee Johnson matches both filters

			// Verify the returned salesperson
			expect(data[0]).toMatchObject({
				firstName: "Lee",
				lastName: "Johnson",
				companyId: bobWidgetsCompany.id,
			});
		});
	});
});
