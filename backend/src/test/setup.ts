// Global test setup file
import { expect, beforeAll } from "vitest";
import { usersReady } from "#/data";

// Ensure database is seeded before any tests run
beforeAll(async () => {
	await usersReady;
});

// Custom matcher for Response objects
expect.extend({
	async toMatchResponse(received: Response, expected) {
		const responseProps = {
			status: received.status,
			statusText: received.statusText,
			ok: received.ok,
			url: received.url,
		};

		// Clone response to read body without consuming original stream
		const clonedResponse = received.clone();
		let bodyPreview = "";
		const _limit = 180;
		try {
			bodyPreview = await clonedResponse.text();
			// bodyPreview = bodyText.length > limit
			// 	? bodyText.substring(0, limit) + '...'
			// 	: bodyText;
		} catch (_error) {
			bodyPreview = "<Unable to read body>";
		}

		const pass = this.equals(responseProps, expect.objectContaining(expected));

		return {
			pass,
			message: () =>
				pass
					? `Expected response not to match ${this.utils.printExpected(expected)}`
					: `Expected response to match ${this.utils.printExpected(expected)}\nReceived: ${this.utils.printReceived(responseProps)}\nBody preview: ${bodyPreview}`,
		};
	},
});
