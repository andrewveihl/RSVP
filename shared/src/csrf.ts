/**
 * CSRF protection: signed double-submit token plus Origin/Referer verification.
 *
 * A random per-browser secret lives in an httpOnly cookie. The page embeds a token
 * derived from it (`salt.hmac(secret, salt)`) in a hidden form field, which comes back
 * on submit. An attacker's page can trigger a cross-site request but can neither read
 * the cookie nor forge the HMAC, so the pair cannot be assembled.
 *
 * The token travels in a form field rather than a header so the RSVP form still works
 * with JavaScript disabled -- the guest site is progressively enhanced throughout.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { allowedOrigins, getConfig } from './config';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf-fields';

// Re-exported so server code has one import for the whole CSRF surface.
export { CSRF_COOKIE, CSRF_HEADER, CSRF_FIELD } from './csrf-fields';

const SALT_BYTES = 16;
const SECRET_BYTES = 32;

export function generateCsrfSecret(): string {
	return randomBytes(SECRET_BYTES).toString('hex');
}

function sign(secret: string, salt: string): string {
	return createHmac('sha256', secret).update(salt).digest('hex');
}

/** Mints a token bound to `secret`. Each call gets a fresh salt; all remain valid. */
export function generateCsrfToken(secret: string): string {
	const salt = randomBytes(SALT_BYTES).toString('hex');
	return `${salt}.${sign(secret, salt)}`;
}

function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');
	// timingSafeEqual throws on length mismatch, so compare lengths first -- the
	// length of a hex digest is not secret.
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

export function validateCsrfToken(
	token: string | null | undefined,
	secret: string | null | undefined
): boolean {
	if (!token || !secret) return false;
	const parts = token.split('.');
	if (parts.length !== 2) return false;
	const [salt, digest] = parts;
	if (!salt || !digest) return false;
	if (!/^[0-9a-f]+$/i.test(salt)) return false;
	return safeEqual(digest, sign(secret, salt));
}

/**
 * Reads the CSRF secret cookie, creating and setting one if the visitor doesn't have
 * it yet. Call this from the page load so the token rendered into the form always has
 * a matching cookie.
 */
export function ensureCsrfSecret(cookies: Cookies, secureUrl = getConfig().siteUrl): string {
	const existing = cookies.get(CSRF_COOKIE);
	if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;

	const secret = generateCsrfSecret();
	cookies.set(CSRF_COOKIE, secret, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: secureUrl.startsWith('https://'),
		maxAge: 60 * 60 * 24 * 7
	});
	return secret;
}

/** Convenience: mint a fresh token and make sure its cookie exists. */
export function issueCsrfToken(cookies: Cookies, secureUrl?: string): string {
	return generateCsrfToken(ensureCsrfSecret(cookies, secureUrl));
}

export interface OriginCheckResult {
	ok: boolean;
	reason?: string;
}

/**
 * Confirms the request was initiated by our own origin.
 *
 * Origin is required (browsers always send it on cross-origin and same-origin POSTs
 * with a body). Referer is checked too when present.
 */
export function verifyRequestOrigin(request: Request): OriginCheckResult {
	const permitted = allowedOrigins();
	const requestOrigin = new URL(request.url).origin;
	const acceptable = new Set([...permitted, requestOrigin]);

	const origin = request.headers.get('origin');
	if (!origin) return { ok: false, reason: 'missing Origin header' };
	if (!acceptable.has(origin)) return { ok: false, reason: `origin not allowed: ${origin}` };

	const referer = request.headers.get('referer');
	if (referer) {
		let refererOrigin: string;
		try {
			refererOrigin = new URL(referer).origin;
		} catch {
			return { ok: false, reason: 'malformed Referer header' };
		}
		if (!acceptable.has(refererOrigin)) {
			return { ok: false, reason: `referer not allowed: ${refererOrigin}` };
		}
	}

	return { ok: true };
}

/**
 * Full gate for a state-changing request: origin first, then the signed token, which
 * may arrive either in the form body or in the header.
 */
export function verifyCsrf(
	request: Request,
	cookies: Cookies,
	formToken?: string | null
): OriginCheckResult {
	const origin = verifyRequestOrigin(request);
	if (!origin.ok) return origin;

	const token = formToken ?? request.headers.get(CSRF_HEADER);
	const secret = cookies.get(CSRF_COOKIE);
	if (!validateCsrfToken(token, secret)) {
		return { ok: false, reason: 'invalid or missing CSRF token' };
	}
	return { ok: true };
}
