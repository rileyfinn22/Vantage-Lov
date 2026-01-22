/**
 * Tenant configuration for multi-tenancy support in the frontend
 * Used to uniquely identify client instances and organize client-side operations
 */

// Get tenant name from environment variables or use default
const tenantName = import.meta.env.VITE_TENANT_NAME || 'sandbox-tenant';

/**
 * Unique tenant identifier for this client instance
 * Used as a prefix in client-side operations to organize data by tenant/instance
 */
export const TENANT_NAME = tenantName;

/**
 * Get the tenant-prefixed path for a file or resource
 * @param resourcePath - The base resource path
 * @returns Tenant-prefixed resource path
 */
export function getTenantPrefixedPath(resourcePath: string): string {
    return `${TENANT_NAME}/${resourcePath}`;
}

/**
 * Check if a resource path belongs to the current tenant
 * @param resourcePath - The resource path to check
 * @returns boolean indicating if path belongs to current tenant
 */
export function isCurrentTenantPath(resourcePath: string): boolean {
    return resourcePath.startsWith(`${TENANT_NAME}/`);
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

/**
 * Get tenant-specific storage key for localStorage/sessionStorage
 * @param key - The base storage key
 * @returns Tenant-prefixed storage key
 */
export function getTenantStorageKey(key: string): string {
    return `${TENANT_NAME}:${key}`;
}

/**
 * Get tenant information for display purposes
 * @returns Object with tenant display information
 */
export function getTenantInfo() {
    return {
        name: TENANT_NAME,
        displayName: TENANT_NAME.charAt(0).toUpperCase() + TENANT_NAME.slice(1).replace('-', ' '),
        isProduction: TENANT_NAME.includes('prod'),
        isSandbox: TENANT_NAME.includes('sandbox'),
        isStaging: TENANT_NAME.includes('staging'),
    };
}
