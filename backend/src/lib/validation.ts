import { z } from "zod";

/**
 * Common validation schemas for API route parameters
 */

/** Schema for routes with a single numeric ID parameter */
export const idParamSchema = z.object({
	id: z.coerce.number().int().positive(),
});
