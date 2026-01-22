/**
 * Tenant configuration for multi-tenancy support
 * Used to uniquely identify server instances and organize file storage
 */

if (!process.env.TENANT_NAME) {
	throw new Error("TENANT_NAME environment variable is required");
}

/**
 * Unique tenant identifier for this server instance
 * Used as a prefix in file paths to organize storage by tenant/instance
 */
export const TENANT_NAME = process.env.TENANT_NAME;

/**
 * Get the tenant-prefixed path for a file
 * @param filePath - The base file path
 * @returns Tenant-prefixed file path
 */
export function getTenantPrefixedPath(filePath: string): string {
	return `${TENANT_NAME}/${filePath}`;
}

/**
 * Check if a file path belongs to the current tenant
 * @param filePath - The file path to check
 * @returns boolean indicating if path belongs to current tenant
 */
export function isCurrentTenantPath(filePath: string): boolean {
	return filePath.startsWith(`${TENANT_NAME}/`);
}

/**
 * Extract the base path from a tenant-prefixed path
 * @param tenantPrefixedPath - The tenant-prefixed path
 * @returns The base path without tenant prefix
 */
export function removeTenantPrefix(tenantPrefixedPath: string): string {
	if (isCurrentTenantPath(tenantPrefixedPath)) {
		return tenantPrefixedPath.substring(TENANT_NAME.length + 1);
	}
	return tenantPrefixedPath;
}
