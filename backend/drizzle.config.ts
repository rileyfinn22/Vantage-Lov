import { defineConfig } from "drizzle-kit";

const { DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE } = process.env;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_DATABASE) {
	throw new Error("Missing required database environment variables: DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE");
}

export default defineConfig({
	out: "./src/drizzle",
	dialect: "postgresql",
	schema: "./src/data/schema.ts",
	schemaFilter: ["public"],
	dbCredentials: {
		host: DB_HOST,
		user: DB_USER,
		password: DB_PASSWORD,
		database: DB_DATABASE,
		port: 5432,
	},
});
