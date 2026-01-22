import { defineConfig } from "drizzle-kit";

const { SANDBOX_DB_GCS_USER, SANDBOX_DB_GCS_PASSWORD, SANDBOX_DB_GCS_HOST } = process.env;

if (!SANDBOX_DB_GCS_USER || !SANDBOX_DB_GCS_PASSWORD || !SANDBOX_DB_GCS_HOST) {
	throw new Error("Missing required sandbox environment variables: SANDBOX_DB_GCS_USER, SANDBOX_DB_GCS_PASSWORD, SANDBOX_DB_GCS_HOST");
}

export default defineConfig({
	out: "./src/drizzle",
	dialect: "postgresql",
	schema: "./src/data/schema.ts",
	schemaFilter: ["public"],
	dbCredentials: {
		host: SANDBOX_DB_GCS_HOST,
		user: SANDBOX_DB_GCS_USER,
		password: SANDBOX_DB_GCS_PASSWORD,
		database: "sandbox-1",
		port: 5432,
		ssl: 'require',
	},
});