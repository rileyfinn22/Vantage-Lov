import "vitest";
interface CustomMatchers<_R = unknown> {
	toMatchResponse(expected: { status?: number; statusText?: string; ok?: boolean; url?: string }): Promise<void>;
}
declare module "vitest" {
	interface Matchers<T = any> extends CustomMatchers<T> {}
}
