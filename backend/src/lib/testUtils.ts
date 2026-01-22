import { auth } from "#/lib/auth";

export async function loginAndGetCookie(email: string, password: string) {
	const { headers } = await auth.api.signInEmail({
		body: { email, password },
		returnHeaders: true, // gives you the Set-Cookie header
	});
	const cookie = headers.get("set-cookie");
	if (!cookie) throw new Error("No session cookie returned");
	return cookie;
}
