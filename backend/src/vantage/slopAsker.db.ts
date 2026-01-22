import { db } from "#/data";
import * as schema from "#/data/schema";
import { sql } from "drizzle-orm";
import type { promptSettingKeys } from "#/data/schema";

// Prompt values are JSONB - can be any valid JSON value
type PromptValue = unknown;

export interface PromptSetting {
	id: number;
	key: (typeof promptSettingKeys.enumValues)[number];
	value: PromptValue;
	createdAt: Date | null;
	updatedAt: Date | null;
}

/**
 * Selects a prompt from the database by key
 * Returns null if not found (caller should use hardcoded default)
 */
export async function selectPromptWithFallback(key: (typeof promptSettingKeys.enumValues)[number]): Promise<PromptValue | null> {
	const result = await db.execute<{ value: PromptValue }>(sql`
		SELECT value FROM system_prompt_settings WHERE key = ${key}
	`);

	const rows = Array.isArray(result) ? result : (result as { rows: unknown }).rows;
	return (rows as Array<{ value: PromptValue }>)?.[0]?.value ?? null;
}

/**
 * Inserts a new prompt setting into the database
 */
export async function insertPromptSetting(key: (typeof promptSettingKeys.enumValues)[number], value: PromptValue): Promise<void> {
	await db.insert(schema.systemPromptSettings).values({
		key,
		value,
	});
}

/**
 * Selects all prompt settings from the database
 */
export async function selectAllPromptSettings(): Promise<PromptSetting[]> {
	return await db.select().from(schema.systemPromptSettings);
}
