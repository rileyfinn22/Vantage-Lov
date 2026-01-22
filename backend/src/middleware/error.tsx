import type { ErrorHandler } from "hono";
import { shouldReturnJson, createJsonErrorResponse } from "#/lib/errorUtils";
import { logger } from "#/lib/logger";

export const errorMiddleware: ErrorHandler = (err, c) => {
	logger.error({ err }, "Error occurred");

	if (shouldReturnJson(c)) {
		const errorResponse = createJsonErrorResponse(err.message, 500);
		return c.json(errorResponse, 500);
	}

	const errorElement = <h1>Error: {err.message}</h1>;
	return c.render(errorElement);
};
