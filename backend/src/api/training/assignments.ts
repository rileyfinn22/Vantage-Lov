import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "#/data";
import * as schema from "#/data/schema";
import { eq, and, desc } from "drizzle-orm";
import { checkManagerAccess } from "#/middleware/authorization";
import { requireAuth } from "#/middleware/auth";
import { idParamSchema } from "#/lib/validation";

// Zod validation schemas
const createFlagAssignmentSchema = z.object({
	salespersonId: z.coerce.number().int().positive(),
	flagId: z.coerce.number().int().positive(),
	title: z.string().min(1),
	description: z.string().optional(),
});

const createSkillAssignmentSchema = z.object({
	salespersonId: z.coerce.number().int().positive(),
	skillKey: z.string().min(1),
	scenarioId: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
});

const createBattleCardAssignmentSchema = z.object({
	salespersonId: z.coerce.number().int().positive(),
	battleCardId: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	dueDate: z.string().datetime().optional(),
});

const createManualAssignmentSchema = z.object({
	salespersonId: z.coerce.number().int().positive(),
	trainingType: z.enum(["scenario", "battle_card", "flag_review"]),
	trainingId: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
	dueDate: z.string().datetime().optional(),
});

const updateAssignmentStatusSchema = z.object({
	status: z.enum(["pending", "in_progress", "completed"]),
});

const salespersonIdParamSchema = z.object({
	salespersonId: z.coerce.number().int().positive(),
});

const assignmentsQuerySchema = z.object({
	source: z.enum(["flag", "skill_threshold", "battle_card", "manual"]).optional(),
	status: z.enum(["pending", "in_progress", "completed"]).optional(),
	priority: z.enum(["low", "normal", "high"]).optional(),
});

const app = new Hono<AuthVariable<false>>()
	// GET /api/training/assignments/:salespersonId
	// Returns all assignments for a salesperson with optional filtering
	.get(
		"/:salespersonId",
		requireAuth,
		zValidator("param", salespersonIdParamSchema),
		zValidator("query", assignmentsQuerySchema),
		async (c) => {
			const currentUser = c.get("user");
			const { salespersonId } = c.req.valid("param");
			const { source, status, priority } = c.req.valid("query");

			// Check if salesperson exists
			const [salesperson] = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, salespersonId)).limit(1);

			if (!salesperson) {
				return c.json({ error: "Salesperson not found" }, 404);
			}

			// Check authorization: must be the salesperson or a manager
			const isManager = await checkManagerAccess(currentUser.id, salesperson.companyId);
			const isSelf = salesperson.associatedUserId === currentUser.id;

			if (!isManager && !isSelf) {
				return c.json({ error: "Unauthorized" }, 401);
			}

			// Build query conditions
			const conditions = [eq(schema.trainingAssignments.salespersonId, salespersonId)];

			if (source) {
				conditions.push(eq(schema.trainingAssignments.assignmentSource, source));
			}
			if (status) {
				conditions.push(eq(schema.trainingAssignments.status, status));
			}
			if (priority) {
				conditions.push(eq(schema.trainingAssignments.priority, priority));
			}

			// Fetch assignments
			const assignments = await db
				.select()
				.from(schema.trainingAssignments)
				.where(and(...conditions))
				.orderBy(desc(schema.trainingAssignments.createdAt));

			return c.json(assignments);
		},
	)

	// POST /api/training/assignments/flag-trigger
	// Auto-creates assignment when flag is raised
	.post("/flag-trigger", requireAuth, zValidator("json", createFlagAssignmentSchema), async (c) => {
		const { salespersonId, flagId, title, description } = c.req.valid("json");

		// Check if salesperson exists
		const [salesperson] = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, salespersonId)).limit(1);

		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check if flag exists
		const [flag] = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId)).limit(1);

		if (!flag) {
			return c.json({ error: "Flag not found" }, 404);
		}

		// Check for existing pending assignment for this flag + salesperson
		const existingAssignment = await db
			.select()
			.from(schema.trainingAssignments)
			.where(
				and(
					eq(schema.trainingAssignments.salespersonId, salespersonId),
					eq(schema.trainingAssignments.trainingType, "flag_review"),
					eq(schema.trainingAssignments.trainingId, String(flagId)),
					eq(schema.trainingAssignments.status, "pending"),
				),
			)
			.limit(1);

		if (existingAssignment.length > 0) {
			// Return existing assignment instead of creating duplicate
			return c.json(existingAssignment[0], 200);
		}

		// Create flag-triggered assignment
		const [assignment] = await db
			.insert(schema.trainingAssignments)
			.values({
				salespersonId,
				companyId: salesperson.companyId,
				assignmentSource: "flag",
				sourceId: String(flagId),
				trainingType: "flag_review",
				trainingId: String(flagId),
				title,
				description: description ?? null,
				priority: "high",
				assignedBy: null, // auto-assigned
				status: "pending",
			})
			.returning();

		return c.json(assignment, 201);
	})

	// POST /api/training/assignments/skill-trigger
	// Auto-creates assignment when skill rating <= 5
	.post("/skill-trigger", requireAuth, zValidator("json", createSkillAssignmentSchema), async (c) => {
		const { salespersonId, skillKey, scenarioId, title, description } = c.req.valid("json");

		// Check if salesperson exists
		const [salesperson] = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, salespersonId)).limit(1);

		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check if scenario exists
		const [scenario] = await db.select().from(schema.trainingScenarios).where(eq(schema.trainingScenarios.scenarioId, scenarioId)).limit(1);

		if (!scenario) {
			return c.json({ error: "Training scenario not found" }, 404);
		}

		// Check for existing pending assignment for this scenario + salesperson
		const existingAssignment = await db
			.select()
			.from(schema.trainingAssignments)
			.where(
				and(
					eq(schema.trainingAssignments.salespersonId, salespersonId),
					eq(schema.trainingAssignments.trainingType, "scenario"),
					eq(schema.trainingAssignments.trainingId, scenarioId),
					eq(schema.trainingAssignments.status, "pending"),
				),
			)
			.limit(1);

		if (existingAssignment.length > 0) {
			// Return existing assignment instead of creating duplicate
			return c.json(existingAssignment[0], 200);
		}

		// Create skill threshold assignment
		const [assignment] = await db
			.insert(schema.trainingAssignments)
			.values({
				salespersonId,
				companyId: salesperson.companyId,
				assignmentSource: "skill_threshold",
				sourceId: skillKey,
				trainingType: "scenario",
				trainingId: scenarioId,
				title,
				description: description ?? null,
				priority: "high",
				assignedBy: null, // auto-assigned
				status: "pending",
			})
			.returning();

		return c.json(assignment, 201);
	})

	// POST /api/training/assignments/battle-card
	// Manager creates battle card assignment
	.post("/battle-card", requireAuth, zValidator("json", createBattleCardAssignmentSchema), async (c) => {
		const currentUser = c.get("user");
		const { salespersonId, battleCardId, title, description, dueDate } = c.req.valid("json");

		// Check if salesperson exists
		const [salesperson] = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, salespersonId)).limit(1);

		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check if user is a manager in the salesperson's company
		const isManager = await checkManagerAccess(currentUser.id, salesperson.companyId);
		if (!isManager) {
			return c.json({ error: "Unauthorized - Manager access required" }, 401);
		}

		// Check for existing pending assignment for this battle card + salesperson
		const existingAssignment = await db
			.select()
			.from(schema.trainingAssignments)
			.where(
				and(
					eq(schema.trainingAssignments.salespersonId, salespersonId),
					eq(schema.trainingAssignments.trainingType, "battle_card"),
					eq(schema.trainingAssignments.trainingId, battleCardId),
					eq(schema.trainingAssignments.status, "pending"),
				),
			)
			.limit(1);

		if (existingAssignment.length > 0) {
			// Return existing assignment instead of creating duplicate
			return c.json(existingAssignment[0], 200);
		}

		// Create battle card assignment
		const [assignment] = await db
			.insert(schema.trainingAssignments)
			.values({
				salespersonId,
				companyId: salesperson.companyId,
				assignmentSource: "battle_card",
				sourceId: battleCardId,
				trainingType: "battle_card",
				trainingId: battleCardId,
				title,
				description: description ?? null,
				priority: "normal",
				assignedBy: currentUser.id,
				dueDate: dueDate ? new Date(dueDate) : null,
				status: "pending",
			})
			.returning();

		return c.json(assignment, 201);
	})

	// POST /api/training/assignments/manual
	// Manager manually creates any type of assignment
	.post("/manual", requireAuth, zValidator("json", createManualAssignmentSchema), async (c) => {
		const currentUser = c.get("user");
		const { salespersonId, trainingType, trainingId, title, description, priority, dueDate } = c.req.valid("json");

		// Check if salesperson exists
		const [salesperson] = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, salespersonId)).limit(1);

		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check if user is a manager in the salesperson's company
		const isManager = await checkManagerAccess(currentUser.id, salesperson.companyId);
		if (!isManager) {
			return c.json({ error: "Unauthorized - Manager access required" }, 401);
		}

		// Create manual assignment
		const [assignment] = await db
			.insert(schema.trainingAssignments)
			.values({
				salespersonId,
				companyId: salesperson.companyId,
				assignmentSource: "manual",
				sourceId: null,
				trainingType,
				trainingId,
				title,
				description: description ?? null,
				priority: priority ?? "normal",
				assignedBy: currentUser.id,
				dueDate: dueDate ? new Date(dueDate) : null,
				status: "pending",
			})
			.returning();

		return c.json(assignment, 201);
	})

	// PATCH /api/training/assignments/:id/status
	// Update assignment status (pending → in_progress → completed)
	.patch("/:id/status", requireAuth, zValidator("param", idParamSchema), zValidator("json", updateAssignmentStatusSchema), async (c) => {
		const currentUser = c.get("user");
		const { id } = c.req.valid("param");
		const { status } = c.req.valid("json");

		// Get the assignment
		const [assignment] = await db.select().from(schema.trainingAssignments).where(eq(schema.trainingAssignments.id, id)).limit(1);

		if (!assignment) {
			return c.json({ error: "Assignment not found" }, 404);
		}

		// Get salesperson info
		const [salesperson] = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, assignment.salespersonId)).limit(1);

		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check authorization: must be the salesperson or a manager
		const isManager = await checkManagerAccess(currentUser.id, salesperson.companyId);
		const isSelf = salesperson.associatedUserId === currentUser.id;

		if (!isManager && !isSelf) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Build update object
		const updateData: any = {
			status,
			updatedAt: new Date(),
		};

		if (status === "completed") {
			updateData.completedAt = new Date();
		}

		// Update the assignment
		const [updated] = await db.update(schema.trainingAssignments).set(updateData).where(eq(schema.trainingAssignments.id, id)).returning();

		return c.json(updated);
	})

	// DELETE /api/training/assignments/:id
	// Delete a training assignment (managers only)
	.delete("/:id", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const currentUser = c.get("user");
		const { id } = c.req.valid("param");

		// Get the assignment
		const [assignment] = await db.select().from(schema.trainingAssignments).where(eq(schema.trainingAssignments.id, id)).limit(1);

		if (!assignment) {
			return c.json({ error: "Assignment not found" }, 404);
		}

		// Get salesperson info
		const [salesperson] = await db.select().from(schema.salespeople).where(eq(schema.salespeople.id, assignment.salespersonId)).limit(1);

		if (!salesperson) {
			return c.json({ error: "Salesperson not found" }, 404);
		}

		// Check if user is a manager
		const isManager = await checkManagerAccess(currentUser.id, salesperson.companyId);
		if (!isManager) {
			return c.json({ error: "Unauthorized - Manager access required" }, 401);
		}

		// Delete the assignment
		await db.delete(schema.trainingAssignments).where(eq(schema.trainingAssignments.id, id));

		return c.json({ success: true });
	});

export default app;
