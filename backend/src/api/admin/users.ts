import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { auth } from "#/lib/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { logger } from "#/lib/logger";
import { db } from "#/data";
import * as schema from "#/data/schema";

// Validation schema for user and salesperson creation
const createUserSchema = z
	.object({
		email: z.string().email("Invalid email address").optional(),
		password: z.string().min(8, "Password must be at least 8 characters").optional(),
		firstName: z.string().min(1, "First name is required"),
		lastName: z.string().min(1, "Last name is required"),
		companyId: z.number().int().positive("Company ID is required"),
		avatar: z.string().optional().nullable(),
	})
	.refine(
		(data) => {
			// Treat empty strings as undefined
			const hasEmail = data.email && data.email.trim().length > 0;
			const hasPassword = data.password && data.password.trim().length > 0;

			// If email is provided, password must also be provided
			if (hasEmail && !hasPassword) {
				return false;
			}
			// If password is provided, email must also be provided
			if (hasPassword && !hasEmail) {
				return false;
			}
			return true;
		},
		{
			message: "Both email and password are required if either is provided",
			path: ["email"],
		},
	);

const app = new Hono<AuthVariable<false>>().post(
	"/",
	zValidator("json", createUserSchema, (result, c) => {
		if (!result.success) {
			logger.warn({ issues: result.error.issues }, "User creation validation failed");
			return c.json({ error: "Invalid user data", details: result.error.issues }, 400);
		}
	}),
	async (c) => {
		const { email, password, firstName, lastName, companyId, avatar } = c.req.valid("json");

		try {
			let userId: string | null = null;
			let user: any = null;

			// Only create auth user if email and password are provided
			if (email && password) {
				const userResult = await auth.api.signUpEmail({
					body: {
						email,
						password,
						name: `${firstName} ${lastName}`,
					},
				});
				userId = userResult.user.id;
				user = {
					id: userResult.user.id,
					email: userResult.user.email,
					name: userResult.user.name,
					emailVerified: userResult.user.emailVerified,
					createdAt: userResult.user.createdAt,
					updatedAt: userResult.user.updatedAt,
				};
			}

			// Create salesperson record (with or without associated user)
			const salespersonRecords = await db
				.insert(schema.salespeople)
				.values({
					firstName,
					lastName,
					avatar: avatar ?? null,
					companyId,
					associatedUserId: userId,
				})
				.returning();

			// Return the created salesperson and user (if created)
			return c.json(
				{
					user,
					salesperson: salespersonRecords[0],
				},
				201,
			);
		} catch (error) {
			logger.error({ error }, "User/Salesperson creation error");

			// Handle specific better-auth errors
			if (error instanceof Error) {
				if (error.message.includes("already exists") || error.message.includes("duplicate")) {
					return c.json({ error: "User with this email already exists" }, 409);
				}
			}

			return c.json({ error: "Failed to create user and salesperson" }, 500);
		}
	},
);

export default app;
