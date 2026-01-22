import type { PgliteDatabase } from "drizzle-orm/pglite";
import { createRequire } from "node:module";
import { globSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";
import { logger } from "#/lib/logger";

export async function pushSchema(db: PgliteDatabase<typeof schema>) {
	const require = createRequire(import.meta.url);
	const { generateDrizzleJson, generateMigration } = require("drizzle-kit/api") as typeof import("drizzle-kit/api");

	const numba = /meta\/0(\d+)_.*$/;
	// Find the latest migration snapshot file
	const currentDir = dirname(fileURLToPath(import.meta.url));
	const metaPath = join(currentDir, "..", "drizzle", "meta");
	const jsonFiles = globSync(join(metaPath, "0*_snapshot.json")).toSorted((a, b) => {
		const a_num = parseInt(a.match(numba)?.[1] ?? "-1", 10);
		const b_num = parseInt(b.match(numba)?.[1] ?? "-1", 10);

		return a_num - b_num;
	});

	// Sort files numerically and get the latest one
	const latestSnapshot = jsonFiles.pop();

	logger.info(`Latest snapshot ${latestSnapshot}`);

	// Load the previous schema from the latest snapshot, or use empty schema if no snapshots exist
	let prevJson: any;
	if (latestSnapshot) {
		prevJson = JSON.parse(readFileSync(latestSnapshot, "utf-8"));
	} else {
		prevJson = generateDrizzleJson({});
	}

	const curJson = generateDrizzleJson(schema, prevJson.id, undefined, "snake_case");
	const statements = await generateMigration(prevJson, curJson);
	if (statements.length > 0) {
		logger.warn({ count: statements.length }, "Have ungenerated migrations");
	}
	for (const statement of statements) {
		await db.execute(statement);
	}
}
