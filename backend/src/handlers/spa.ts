import type { Handler } from "hono";
import { readFile } from "node:fs/promises";

const index_page = await readFile("../frontend/dist/index.html", "utf-8");

export const spaHandler: Handler = async (c, next) => {
	const path = c.req.path;

	// Skip SPA handling for API routes - let them fall through to notFound handler
	if (path.startsWith("/api/") || path.startsWith("/vantage/")) {
		// console.warn("Should not be tripping the SPA handler for this path: ", path);
		await next();
		return;
	}

	return c.html(index_page);
};
