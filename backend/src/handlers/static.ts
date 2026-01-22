import type { ServeStaticOptions } from "@hono/node-server/serve-static";
import { logger } from "#/lib/logger";

export const staticAssetConfig: ServeStaticOptions = {
	root: process.env.FRONTEND_DIST_PATH || "../frontend/dist",
	onNotFound(path, _c) {
		logger.error({ path }, "Asset not found");
	},
};
