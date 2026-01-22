import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "#/data";
import * as schema from "#/data/schema";
import { logger } from "#/lib/logger";

// Build trusted origins list from environment variables
const trustedOrigins: string[] = [];

// Add development origins (only if in dev mode)
if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
	trustedOrigins.push("https://localhost:5173");
	trustedOrigins.push("https://localhost:3000");
	trustedOrigins.push("https://localhost:5000");
	trustedOrigins.push("https://localhost:5025");

	trustedOrigins.push("http://localhost:5173");
	trustedOrigins.push("http://localhost:3000");
	trustedOrigins.push("http://localhost:5000");
	trustedOrigins.push("http://localhost:5025");
}

// Add production host if specified
if (process.env.HOST) {
	logger.info({ HOST: process.env.HOST }, "Have a host!");
	trustedOrigins.push(`https://${process.env.HOST}`);
}

// Allow additional trusted origins from env (comma-separated)
if (process.env.TRUSTED_ORIGINS) {
	const additionalOrigins = process.env.TRUSTED_ORIGINS.split(",").map((o) => o.trim());
	trustedOrigins.push(...additionalOrigins);
}

// Fail if no trusted origins configured in production
if (trustedOrigins.length === 0 && process.env.NODE_ENV === "production") {
	throw new Error("No trusted origins configured. Set HOST or TRUSTED_ORIGINS environment variable.");
}

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		// schema: 'auth',
		schema,
	}),
	emailAndPassword: {
		enabled: true,
	},

	trustedOrigins,
	logger: {
		disabled: false,
		level: "warn",
		log: (level, message, ...args) => {
			switch (level) {
				case "debug":
					logger.debug({ module: "Auth" }, message, ...args);
					break;
				case "info":
					logger.info({ module: "Auth" }, message, ...args);
					break;
				case "warn":
					logger.warn({ module: "Auth" }, message, ...args);
					break;
				case "error":
					logger.error({ module: "Auth" }, message, ...args);
					break;
				default:
					logger.info({ module: "Auth", level }, message, ...args);
					break;
			}
		},
	},
});
