import { Hono } from "hono";
import { renderer } from "./renderer";
import test_routes from "./vantage";
import { serveStatic } from "@hono/node-server/serve-static";
import { auth } from "./lib/auth";
import type { AuthVariable } from "#/lib/types";
import { createDelayMiddleware } from "./lib/delayMiddleware";
import { authMiddleware } from "./middleware/auth";
import { errorMiddleware } from "./middleware/error";
import { tracingMiddleware } from "./middleware/tracing";
import { staticAssetConfig } from "./handlers/static";
import { spaHandler } from "./handlers/spa";
import { notFoundHandler } from "./handlers/notFound";
import { compress } from "hono/compress";

const delayMultiplier = process.env.FAKE_DELAY_MULTIPLIER ? Number(process.env.FAKE_DELAY_MULTIPLIER) : 0;

const app = new Hono<AuthVariable<true>>()
	.onError(errorMiddleware)
	.use("*", tracingMiddleware)
	.use("*", authMiddleware)
	.use("*", compress())
	.use("*", delayMultiplier > 0 ? createDelayMiddleware(delayMultiplier) : async (_c, next) => await next())
	.use(renderer)
	.use("/assets/*", serveStatic(staticAssetConfig))
	.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))
	.route("/vantage", test_routes)
	.all("*", spaHandler)
	.notFound(notFoundHandler);

// const client = hc<AppType>('http://localhost:3000');
export default app;
export type ClientType = typeof app;
