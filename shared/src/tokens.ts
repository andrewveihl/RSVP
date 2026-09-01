/**
 * Household RSVP tokens.
 *
 * A token is the guest's only credential, so it has to be unguessable: 24 random bytes
 * rendered base64url gives 32 characters and 192 bits of entropy. Even with the whole
 * guest list known, an attacker cannot enumerate their way to somebody else's RSVP.
 *
 * base64url is used rather than hex so the token stays short enough to print under a
 * QR code as a fallback URL, and needs no percent-encoding in a path segment.
 */
import { randomBytes, randomUUID } from 'node:crypto';

export const TOKEN_BYTES = 24;
export const TOKEN_LENGTH = 32;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function generateToken(): string {
	return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Cheap shape check, run before touching the database.
 *
 * It is not authentication -- the lookup still has to find the household -- but it
 * turns a path full of SQL metacharacters into a 404 without a query.
 */
export function isValidTokenFormat(token: unknown): token is string {
	return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** Ids for every table. UUIDv4 -- opaque, collision-free, and never guessed at. */
export function newId(): string {
	return randomUUID();
}

// Re-exported so server code has a single import for tokens and their URLs. They are
// defined in their own module because this one imports `node:crypto`, which a browser
// bundle cannot resolve -- and the admin's live preview has to build the link it draws.
export { rsvpUrl, lookupUrl } from './rsvp-url';
