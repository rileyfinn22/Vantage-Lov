import { db } from "#/data";
import * as schema from "#/data/schema";
import { sql } from "drizzle-orm";
import { Table, is } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core";
import { Sql } from "postgres";
import { logger } from "#/lib/logger";


logger.info("Truncating all tables");
// Truncate every table in schema
for (const [name, table] of Object.entries(schema)) {
    if (is(table, Table)) {
        const { name } = getTableConfig(table)
        logger.info({ tableName: name }, "Truncating table");
        const result = await db.execute(`TRUNCATE "${name}" CASCADE;`);
        // logger.debug({ result }, "Truncate result");
    }
}

logger.info("Done!");
process.exit(0);