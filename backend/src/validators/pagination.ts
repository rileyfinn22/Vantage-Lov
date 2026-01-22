import { z } from "zod";

/**
 * Zod schema for pagination query parameters
 * - page: Page number (must be >= 1, defaults to 1)
 * - pageSize: Number of items per page (1-100, defaults to 5)
 */
export const paginationQuerySchema = z.object({
	page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
	pageSize: z.coerce.number().int().min(1, "Page size must be at least 1").max(100, "Page size cannot exceed 100").default(5),
});

/**
 * Type for pagination query parameters
 */
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Type for pagination metadata in response
 */
export interface PaginationMetadata {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

/**
 * Helper function to calculate pagination offset
 */
export function calculateOffset(page: number, pageSize: number): number {
	return (page - 1) * pageSize;
}

/**
 * Helper function to calculate total pages
 */
export function calculateTotalPages(total: number, pageSize: number): number {
	return Math.ceil(total / pageSize);
}

/**
 * Helper function to create pagination metadata
 */
export function createPaginationMetadata(page: number, pageSize: number, total: number): PaginationMetadata {
	return {
		page,
		pageSize,
		total,
		totalPages: calculateTotalPages(total, pageSize),
	};
}
