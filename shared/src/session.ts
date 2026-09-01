/**
 * Admin session handling.
 *
 * There is exactly one admin (the couple), so there is no user table and no session
 * store: the cookie is a self-contained HMAC-signed expiry stamp. The signing key is
 * derived from ADMIN_PASSWORD, which means rotating the password instantly invalidates
 * every outstanding session.
 *
 * Expiry is sliding -- 30 minutes of inactivity by default -- so the guard re-issues
 * the cookie on each authenticated request, and an idle tab is logged out.
 */
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { getConfig } from './config';

export const ADMIN_COOKIE = 'rsvp_admin';

const KEY_SALT = 'wedding-rsvp.session.v1';
/** Re-issue the cookie at most once a minute to avoid a Set-Cookie on every asset. */
const REISSUE_INTERVAL_MS = 60_000;

/**
 * scrypt is deliberately slow, so the derived key is memoised against the password it
 * came from -- otherwise every authenticated admin request would pay ~100ms.
 */
let keyCache: { password: string; key: Buffer } | null = null;

function signingKey(): Buffer {
	const password = getConfig().adminPassword;
	if (!password) throw new Error('ADMIN_PASSWORD is not set.');
	if (keyCache?.password === password) return keyCache.key;

	const key = scryptSync(password, KEY_SALT, 32);
	keyCache = { password, key };
	return key;
}

function sign(payload: string): string {
	return createHmac('sha256', signingKey()).update(payload).digest('hex');
}

function constantTimeEquals(a: string, b: string): boolean {
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time password check; returns false when no password is configured.
 *
 * Both sides are HMAC'd first so the comparison operates on two equal-length digests:
 * that keeps the check constant time without leaking the real password's length.
 */
export function verifyAdminPassword(candidate: string): boolean {
	const expected = getConfig().adminPassword;
	if (!expected) return false;
	const hashed = (value: string) => createHmac('sha256', KEY_SALT).update(value).digest('hex');
	return constantTimeEquals(hashed(candidate), hashed(expected));
}

export function createSessionToken(now = Date.now()): string {
	const expiresAt = now + getConfig().adminSessionTtlMs;
	const payload = `${expiresAt}.${now}`;
	return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): boolean {
	if (!token) return false;
	const parts = token.split('.');
	if (parts.length !== 3) return false;

	const [expiresAt, issuedAt, digest] = parts;
	if (!/^\d+$/.test(expiresAt) || !/^\d+$/.test(issuedAt)) return false;

	let expected: string;
	try {
		expected = sign(`${expiresAt}.${issuedAt}`);
	} catch {
		return false; // No ADMIN_PASSWORD configured -- nobody gets in.
	}

	if (!constantTimeEquals(digest, expected)) return false;
	return Number(expiresAt) > now;
}

function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'strict' as const,
		secure: getConfig().adminUrl.startsWith('https://'),
		maxAge: Math.floor(getConfig().adminSessionTtlMs / 1000)
	};
}

export function setSessionCookie(cookies: Cookies, token = createSessionToken()): void {
	cookies.set(ADMIN_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(ADMIN_COOKIE, { path: '/' });
}

/**
 * Validates the cookie and, when it is more than a minute old, slides the expiry
 * forward. Returns whether the caller is an authenticated admin.
 */
export function readSession(cookies: Cookies, now = Date.now()): boolean {
	const token = cookies.get(ADMIN_COOKIE);
	if (!verifySessionToken(token, now)) return false;

	const issuedAt = Number(String(token).split('.')[1]);
	if (now - issuedAt > REISSUE_INTERVAL_MS) {
		setSessionCookie(cookies, createSessionToken(now));
	}
	return true;
}
