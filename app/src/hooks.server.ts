/**
 * Request-wide setup for the guest site: client IP resolution, a correlation id for
 * logs, a broad per-IP budget on page views, and a defence-in-depth copy of the
 * security headers.
 *
 * There is no session handling here -- the admin panel is a separate app on its own
 * subdomain and container, so this process never sees an admin cookie and cannot be
 * tricked into minting one.
 *
 * nginx sets those headers in production. Setting them here too means the site is
 * still safe when run directly: in development, in the E2E suite, or if port 3000 is
 * ever exposed by mistake.
 */
import { randomUUID } from 'node:crypto';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getConfig } from '$shared/config';
import { checkRateLimit, resolveClientIp } from '$shared/rate-limiter';
import { logError, logger } from '$shared/logger';
import { bootstrapDatabase } from '$shared/db';

/**
 * The CSP is restrictive on purpose: no third-party origin appears anywhere on the
 * guest site, so nothing needs to be allow-listed. `data:` is permitted for images
 * because the QR code on the RSVP page is inlined rather than fetched.
 *
 * `unsafe-inline` for scripts is what SvelteKit's hydration bootstrap requires; every
 * other directive is as tight as it goes.
 */
const SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'x-xss-protection': '1; mode=block',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
	'content-security-policy': [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"connect-src 'self'",
		"font-src 'self'",
		"frame-ancestors 'none'",
		"form-action 'self'",
		"base-uri 'self'",
		"object-src 'none'"
	].join('; ')
};

// Seeding runs once per process, at first request rather than at import: importing a
// module must never open a database, or `vitest` and `svelte-check` would both try to.
let bootstrapped = false;
function ensureBootstrapped(): void {
	if (bootstrapped) return;
	bootstrapped = true;
	try {
		bootstrapDatabase();
	} catch (error) {
		// A failure here is worth knowing about, but it must not take the site down --
		// the admin container seeds the same rows.
		logError('Database bootstrap failed', error);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const startedAt = Date.now();
	ensureBootstrapped();

	event.locals.requestId = randomUUID().slice(0, 8);
	event.locals.clientIp = resolveClientIp(event.request, () => event.getClientAddress());

	// A generous ceiling on page views. The tight limit that actually matters is
	// applied on the RSVP submission itself, in its own action.
	if (event.request.method === 'GET' && !event.url.pathname.startsWith('/_app/')) {
		const budget = checkRateLimit(`page:${event.locals.clientIp}`, getConfig().pageRateLimit);
		if (!budget.allowed) {
			return new Response('Too many requests. Please slow down.', {
				status: 429,
				headers: { 'retry-after': String(budget.retryAfter), 'content-type': 'text/plain' }
			});
		}
	}

	const response = await resolve(event);

	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}

	// HSTS only makes sense once we are actually being served over TLS.
	if (event.url.protocol === 'https:' && !response.headers.has('strict-transport-security')) {
		response.headers.set(
			'strict-transport-security',
			'max-age=63072000; includeSubDomains; preload'
		);
	}

	// A token in a URL must never be handed to a search engine or a link preview.
	if (event.url.pathname.startsWith('/rsvp')) {
		response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
		response.headers.set('cache-control', 'no-store');
	}

	logger.debug(
		{
			event: 'request',
			requestId: event.locals.requestId,
			method: event.request.method,
			path: safePath(event.url.pathname),
			status: response.status,
			durationMs: Date.now() - startedAt
		},
		'handled request'
	);

	return response;
};

/**
 * A path safe to write to a log.
 *
 * A household's token is in the URL of its RSVP page, and it is the only credential
 * that page has. Logs get shipped, tailed over someone's shoulder and pasted into bug
 * reports, so the token is replaced rather than recorded -- and it has to be replaced
 * on *every* path that reaches the log, which is why this is a function and not a
 * ternary written out once.
 */
function safePath(pathname: string): string {
	return pathname.startsWith('/rsvp/') ? '/rsvp/[token]' : pathname;
}

export const handleError: HandleServerError = ({ error, event }) => {
	const requestId = event.locals?.requestId ?? 'unknown';
	logError('Unhandled server error', error, {
		requestId,
		path: safePath(event.url.pathname),
		method: event.request.method
	});
	return {
		message: 'Something went wrong on our end. Please try again.',
		requestId
	};
};
