/**
 * Encryption for the one genuinely sensitive value the database holds: the Gmail app
 * password.
 *
 * Everything else in here is wedding data -- names, addresses, RSVP tokens. Those matter,
 * but they are *this* application's data. A Gmail app password is a credential to an
 * account that has nothing to do with the wedding, and the couple can download the whole
 * database from the Backups screen with one click. A backup file left in a Downloads
 * folder should not hand over the ability to send mail as them.
 *
 * The key is derived from ADMIN_PASSWORD, which is deliberate: it means the secret is
 * only recoverable by someone who already has the admin credential, and it is not stored
 * anywhere alongside the ciphertext. The cost is that changing ADMIN_PASSWORD makes the
 * stored password unreadable -- so `decryptSecret` reports that cleanly and the Settings
 * screen asks for it again rather than failing at send time.
 *
 * AES-256-GCM, so a tampered ciphertext fails to authenticate rather than decrypting to
 * something arbitrary.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { getConfig } from './config';

const ALGORITHM = 'aes-256-gcm';
const KEY_SALT = 'wedding-rsvp.secrets.v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Marks the stored format, so a future scheme can be told apart from this one. */
const PREFIX = 'v1';

/**
 * scrypt is deliberately slow, so the derived key is memoised against the password it
 * came from -- otherwise every send would pay ~100ms before the first byte of SMTP.
 */
let keyCache: { password: string; key: Buffer } | null = null;

function encryptionKey(): Buffer | null {
	const password = getConfig().adminPassword;
	if (!password) return null;
	if (keyCache?.password === password) return keyCache.key;

	const key = scryptSync(password, KEY_SALT, 32);
	keyCache = { password, key };
	return key;
}

/** True when there is an ADMIN_PASSWORD to derive a key from. */
export function canStoreSecrets(): boolean {
	return encryptionKey() !== null;
}

/**
 * Encrypts a value for storage. Returns null when no key is available, which the caller
 * must treat as "cannot store this" rather than storing the plaintext.
 */
export function encryptSecret(plaintext: string): string | null {
	const key = encryptionKey();
	if (!key) return null;

	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	return [PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(
		':'
	);
}

export type DecryptResult =
	| { ok: true; value: string }
	/**
	 * 'unreadable' means the ciphertext is intact but this key cannot open it -- almost
	 * always because ADMIN_PASSWORD changed. Distinguished from 'missing' so the UI can
	 * say "enter it again" rather than "not configured".
	 */
	| { ok: false; reason: 'missing' | 'unreadable' };

export function decryptSecret(stored: string | null | undefined): DecryptResult {
	if (!stored) return { ok: false, reason: 'missing' };

	const key = encryptionKey();
	if (!key) return { ok: false, reason: 'unreadable' };

	const parts = stored.split(':');
	if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, reason: 'unreadable' };

	try {
		const iv = Buffer.from(parts[1], 'base64');
		const tag = Buffer.from(parts[2], 'base64');
		const payload = Buffer.from(parts[3], 'base64');

		if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
			return { ok: false, reason: 'unreadable' };
		}

		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);
		const value = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');

		return { ok: true, value };
	} catch {
		// A wrong key fails the GCM tag check, which throws. That is the expected path
		// after a password rotation, not an error worth logging as a fault.
		return { ok: false, reason: 'unreadable' };
	}
}
