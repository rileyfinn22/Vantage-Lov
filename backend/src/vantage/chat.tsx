import type { Context } from "hono";
import { basePath } from "hono/route";
import { logger } from "#/lib/logger";

export const SlopIsBadPage = (c: Context) => {
	logger.debug({ basePath: basePath(c) }, "SlopIsBadPage rendered");
	const thisAction = `${basePath(c)}/api/slop/is_bad`;
	return c.render(
		<div>
			<form action={thisAction} method="post">
				<textarea name="message" placeholder="Type your message here..." />
				<button type="submit">Send</button>
			</form>
		</div>,
	);
};
