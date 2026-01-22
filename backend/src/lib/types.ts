import type { auth } from "./auth";
import type { Span } from "@opentelemetry/api";

export type AuthVariable<NULLABLE extends boolean = true> = {
	Variables: {
		user: NULLABLE extends true ? typeof auth.$Infer.Session.user | null : typeof auth.$Infer.Session.user;
		session: NULLABLE extends true ? typeof auth.$Infer.Session.session | null : typeof auth.$Infer.Session.session;
		span?: Span; // Optional - only present when tracing middleware is enabled
	};
};
