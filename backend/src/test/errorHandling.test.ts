import { describe, it, expect } from "vitest";
import app from "#/index";

describe("Error Handling Tests", () => {
	describe("404 Not Found", () => {
		it("should return JSON error for API routes", async () => {
			const req = new Request("http://localhost/api/nonexistent");
			const res = await app.request(req);

			expect(res.status).toBe(404);
			expect(res.headers.get("content-type")).toContain("application/json");

			const data = await res.json();
			expect(data).toHaveProperty("error");
			expect(data).toHaveProperty("status");
			expect(data.error).toBe("Route not found");
			expect(data.status).toBe(404);
		});

		it("should return 404 for nonexistent vantage subroutes", async () => {
			// Non-existent subroutes under /vantage return 404 since they're not mounted
			const req = new Request("http://localhost/vantage/nonexistent");
			const res = await app.request(req);

			expect(res.status).toBe(404);
		});

		it("should return JSON when Accept header includes application/json for truly missing routes", async () => {
			// Test a route that won't be caught by SPA handler
			const req = new Request("http://localhost/api/missing/endpoint", {
				headers: { Accept: "application/json" },
			});
			const res = await app.request(req);

			expect(res.status).toBe(404);
			expect(res.headers.get("content-type")).toContain("application/json");

			const data = await res.json();
			expect(data).toHaveProperty("error");
			expect(data.error).toBe("Route not found");
		});

		it("should still serve SPA for non-API routes (frontend paths)", async () => {
			// Non-API routes are handled by SPA handler, so they return 200
			const req = new Request("http://localhost/nonexistent");
			const res = await app.request(req);

			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/html");
		});
	});
});
