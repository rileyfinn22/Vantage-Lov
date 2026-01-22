import { companies, authUserRoles, interactions, flags, salespeople, ratings } from "#/data/schema";

export const tables = {
	companies,
	authUserRoles,
	interactions,
	flags,
	salespeople,
	ratings,
} as const;
