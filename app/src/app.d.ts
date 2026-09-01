// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Best-effort client IP, resolved through the nginx X-Forwarded-For chain. */
			clientIp: string;
			/** Correlates every log line emitted while handling one request. */
			requestId: string;
		}
		interface Error {
			requestId?: string;
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
