/**
 * Request-wide setup for the admin app: client IP, a log correlation id, the session
 * flag, a defence-in-depth copy of the security headers, and the daily backup timer.
 *
 * nginx sets those headers in production, but setting them here too keeps the app safe
 * when it is run directly -- in development, in the E2E suite, or if the container port
 * is ever exposed by mistake.
 *
 * The admin CSP is a touch looser than the guest one in exactly one respect: `blob:` is
 * allowed for images, because generated QR codes and PDF previews are handed to the
 * page as object URLs rather than round-tripped through the server.
 */
import { randomUUID } from 'node:crypto';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { resolveClientIp } from '$shared/rate-limiter';
import { readSession } from '$shared/session';
import { logError, logger } from '$shared/logger';
import { bootstrapDatabase } from '$shared/db';
import { startBackupSchedule } from '$lib/server/schedule';

const SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'x-xss-protection': '1; mode=block',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
	'content-security-policy': [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"connect-src 'self'",
		"font-src 'self'",
		"frame-ancestors 'none'",
		"form-action 'self'",
		"base-uri 'self'",
		"object-src 'none'"
	].join('; ')
};

let started = false;
function ensureStarted(): void {
	if (started) return;
	started = true;
	try {
		bootstrapDatabase();
		startBackupSchedule();
	} catch (error) {
		// A failure here must not take the admin panel down -- losing the backup timer
		// is bad, but losing the ability to add a guest the week of the wedding is worse.
		logError('Admin boot tasks failed', error);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const startedAt = Date.now();
	ensureStarted();

	event.locals.requestId = randomUUID().slice(0, 8);
	event.locals.clientIp = resolveClientIp(event.request, () => event.getClientAddress());

	try {
		event.locals.admin = readSession(event.cookies);
	} catch {
		// A missing ADMIN_PASSWORD means nobody is signed in, not that the app falls over.
		event.locals.admin = false;
	}

	const response = await resolve(event);

	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}

	if (event.url.protocol === 'https:' && !response.headers.has('strict-transport-security')) {
		response.headers.set(
			'strict-transport-security',
			'max-age=63072000; includeSubDomains; preload'
		);
	}

	logger.debug(
		{
			event: 'request',
			requestId: event.locals.requestId,
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			durationMs: Date.now() - startedAt
		},
		'handled admin request'
	);

	return response;
};

export const handleError: HandleServerError = ({ error, event }) => {
	const requestId = event.locals?.requestId ?? 'unknown';
	logError('Unhandled admin error', error, {
		requestId,
		path: event.url.pathname,
		method: event.request.method
	});
	return {
		message: 'Something went wrong. Please try again.',
		requestId
	};
};
