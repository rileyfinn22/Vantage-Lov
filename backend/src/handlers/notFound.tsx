import type { NotFoundHandler } from "hono";
import { shouldReturnJson, createJsonErrorResponse } from "#/lib/errorUtils";
import { logger } from "#/lib/logger";

export const notFoundHandler: NotFoundHandler = (c) => {
	logger.error({ path: c.req.path }, "Route not found");

	if (shouldReturnJson(c)) {
		const errorResponse = createJsonErrorResponse("Route not found", 404);
		return c.json(errorResponse, 404);
	}

	const notFoundElement = <h1>NOT FOUND</h1>;
	return c.render(notFoundElement);
};
