import type { AuthVariable } from "#/lib/types";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "#/middleware/auth";
import { idParamSchema } from "#/lib/validation";
import {
	getNotifications,
	markNotificationRead,
	dismissNotification,
	markAllNotificationsRead,
	deleteNotification,
} from "#/vantage/notifications";

const app = new Hono<AuthVariable<false>>()
	// Get all notifications for the current user
	.get("/", requireAuth, async (c) => {
		const notifications = await getNotifications(c.get("user").id);
		return c.json({ notifications });
	})

	// Mark notification as read
	.patch("/:id/read", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const notificationId = c.req.valid("param").id;
		const currentUser = c.get("user");

		const updatedNotification = await markNotificationRead(notificationId, currentUser.id);

		if (!updatedNotification) {
			return c.json({ error: "Notification not found or unauthorized" }, 404);
		}

		return c.json(updatedNotification);
	})

	// Dismiss notification
	.patch("/:id/dismiss", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const notificationId = c.req.valid("param").id;
		const currentUser = c.get("user");

		const updatedNotification = await dismissNotification(notificationId, currentUser.id);

		if (!updatedNotification) {
			return c.json({ error: "Notification not found or unauthorized" }, 404);
		}

		return c.json(updatedNotification);
	})

	// Delete notification
	.delete("/:id", requireAuth, zValidator("param", idParamSchema), async (c) => {
		const notificationId = c.req.valid("param").id;
		const currentUser = c.get("user");

		const deletedNotification = await deleteNotification(notificationId, currentUser.id);

		if (!deletedNotification) {
			return c.json({ error: "Notification not found or unauthorized" }, 404);
		}

		return c.json({ success: true });
	})

	// Mark all notifications as read
	.patch("/mark-all-read", requireAuth, async (c) => {
		const currentUser = c.get("user");

		const updatedNotifications = await markAllNotificationsRead(currentUser.id);

		return c.json({
			success: true,
			updatedCount: updatedNotifications.length,
		});
	});

export default app;
