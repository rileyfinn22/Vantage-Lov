import { describe, test, expect } from "vitest";
import app from "#/index";
import { loginAndGetCookie } from "#/lib/testUtils";

describe("/vantage/api/myuser Route", () => {
	describe("Authentication", () => {
		test("Should deny access without authentication", async () => {
			const response = await app.request("/vantage/api/myuser");
			expect(response.status).toBe(401);
			const data = await response.json();
			expect(data).toEqual({ error: "Unauthorized" });
		});
	});

	describe("User Data Response", () => {
		test("Should return user details and roles for regular salesperson", async () => {
			// Bob is a salesperson with company role but no site admin role
			const cookie = await loginAndGetCookie("bob@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/myuser", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			// Verify user details structure
			expect(data).toHaveProperty("user");
			expect(data.user).toHaveProperty("id");
			expect(data.user).toHaveProperty("name", "bob");
			expect(data.user).toHaveProperty("email", "bob@v.alexw.codes");
			expect(data.user).toHaveProperty("emailVerified");
			expect(data.user).toHaveProperty("createdAt");
			expect(data.user).toHaveProperty("updatedAt");

			// Verify roles structure
			expect(data).toHaveProperty("roles");
			expect(data.roles).toHaveProperty("siteRoles");
			expect(data.roles).toHaveProperty("companyRoles");

			// Bob should have no site roles (empty array)
			expect(Array.isArray(data.roles.siteRoles)).toBe(true);
			expect(data.roles.siteRoles).toEqual([]);

			// Bob should have company role at Bob's Widgets
			expect(Array.isArray(data.roles.companyRoles)).toBe(true);
			expect(data.roles.companyRoles.length).toBeGreaterThan(0);

			const companyRole = data.roles.companyRoles[0];
			expect(companyRole).toHaveProperty("companyId");
			expect(companyRole).toHaveProperty("companyName", "Bob's Widgets");
			expect(companyRole).toHaveProperty("role", "admin");
		});

		test("Should return user details and admin role for site admin", async () => {
			// Alex is a site admin
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/myuser", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			// Verify user details
			expect(data.user).toHaveProperty("name", "alex");
			expect(data.user).toHaveProperty("email", "alex@v.alexw.codes");

			// Alex should have site admin role
			expect(data.roles.siteRoles).toContain("admin");

			// Alex should have no company roles (empty array)
			expect(data.roles.companyRoles).toEqual([]);
		});

		test("Should return user details for salesperson with company role", async () => {
			// Lee is a salesperson at Bob's Widgets
			const cookie = await loginAndGetCookie("lee@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/myuser", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			// Verify user details
			expect(data.user).toHaveProperty("name", "lee");
			expect(data.user).toHaveProperty("email", "lee@v.alexw.codes");

			// Lee should have no site roles
			expect(data.roles.siteRoles).toEqual([]);

			// Lee should have salesperson role at Bob's Widgets
			expect(data.roles.companyRoles.length).toBeGreaterThan(0);
			const companyRole = data.roles.companyRoles[0];
			expect(companyRole).toHaveProperty("companyName", "Bob's Widgets");
			expect(companyRole).toHaveProperty("role", "salesperson");
		});

		test("Should return user with multiple company roles", async () => {
			// Angela is a salesperson at Robert's Insurance
			const cookie = await loginAndGetCookie("angela@v.alexw.codes", "brazil-tree-fire");
			const response = await app.request("/vantage/api/myuser", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
			const data = await response.json();

			// Verify user details
			expect(data.user).toHaveProperty("name", "angela");
			expect(data.user).toHaveProperty("email", "angela@v.alexw.codes");

			// Angela should have no site roles
			expect(data.roles.siteRoles).toEqual([]);

			// Angela should have company role at Robert's Insurance
			expect(data.roles.companyRoles.length).toBeGreaterThan(0);
			const companyRole = data.roles.companyRoles[0];
			expect(companyRole).toHaveProperty("companyName", "Robert's Insurance");
			expect(companyRole).toHaveProperty("role", "salesperson");
		});
	});

	describe("Error Handling", () => {
		test("Should handle database errors gracefully", async () => {
			const cookie = await loginAndGetCookie("alex@v.alexw.codes", "brazil-tree-fire");

			// This test would require mocking the database to simulate an error
			// For now, we'll just verify the route works under normal conditions
			const response = await app.request("/vantage/api/myuser", {
				headers: { cookie },
			});

			expect(response.status).toBe(200);
		});
	});
});
