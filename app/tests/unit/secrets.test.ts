import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropDatabase, freshDatabase } from './helpers';
import { canStoreSecrets, decryptSecret, encryptSecret } from '$shared/secrets';
import {
	effectiveSettings,
	getRawSetting,
	hasGmailPassword,
	setGmailPassword,
	setSetting,
	smtpConfig
} from '$shared/db';

beforeEach(freshDatabase);
afterEach(() => {
	dropDatabase();
	process.env.ADMIN_PASSWORD = 'test-password';
	delete process.env.GMAIL_USER;
	delete process.env.GMAIL_APP_PASSWORD;
});

describe('secret storage', () => {
	it('round-trips a value', () => {
		const encrypted = encryptSecret('abcd efgh ijkl mnop')!;
		expect(decryptSecret(encrypted)).toEqual({ ok: true, value: 'abcd efgh ijkl mnop' });
	});

	it('never stores the plaintext', () => {
		const encrypted = encryptSecret('hunter2-app-password')!;
		expect(encrypted).not.toContain('hunter2');
		expect(encrypted.startsWith('v1:')).toBe(true);
	});

	it('produces a different ciphertext each time', () => {
		// A fresh IV per encryption, so two identical passwords do not look identical
		// in the database.
		expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
	});

	it('refuses a tampered ciphertext rather than returning something wrong', () => {
		const encrypted = encryptSecret('original')!;
		const parts = encrypted.split(':');
		// Flip a byte in the payload; GCM authentication must catch it.
		const payload = Buffer.from(parts[3], 'base64');
		payload[0] ^= 0xff;
		const tampered = [parts[0], parts[1], parts[2], payload.toString('base64')].join(':');

		expect(decryptSecret(tampered)).toEqual({ ok: false, reason: 'unreadable' });
	});

	it('reports missing and malformed input distinctly from a wrong key', () => {
		expect(decryptSecret(null)).toEqual({ ok: false, reason: 'missing' });
		expect(decryptSecret('')).toEqual({ ok: false, reason: 'missing' });
		expect(decryptSecret('not-our-format')).toEqual({ ok: false, reason: 'unreadable' });
	});

	it('cannot read a secret after the admin password changes', () => {
		const encrypted = encryptSecret('app-password')!;

		process.env.ADMIN_PASSWORD = 'a-different-password';
		try {
			// The key is derived from ADMIN_PASSWORD, so rotating it makes the stored
			// value unrecoverable -- deliberately, and reported rather than thrown.
			expect(decryptSecret(encrypted)).toEqual({ ok: false, reason: 'unreadable' });
		} finally {
			process.env.ADMIN_PASSWORD = 'test-password';
		}
	});

	it('cannot store anything without an admin password to derive a key from', () => {
		process.env.ADMIN_PASSWORD = '';
		try {
			expect(canStoreSecrets()).toBe(false);
			expect(encryptSecret('x')).toBeNull();
		} finally {
			process.env.ADMIN_PASSWORD = 'test-password';
		}
	});
});

describe('gmail settings', () => {
	it('stores the app password encrypted, and reads it back for sending', () => {
		setSetting('gmail_user', 'couple@gmail.com');
		expect(setGmailPassword('abcd efgh ijkl mnop')).toEqual({ ok: true });

		// What is on disk is not the password.
		expect(getRawSetting('gmail_app_password')).not.toContain('abcd');
		// What the mailer sees is, with the spaces Google displays left intact.
		expect(smtpConfig().appPassword).toBe('abcd efgh ijkl mnop');
		expect(hasGmailPassword()).toBe(true);
	});

	it('keeps the password out of anything a page load hands to the browser', () => {
		setGmailPassword('a-real-secret');

		const settings = effectiveSettings();
		expect(settings.gmail_app_password).toBe('');
		expect(JSON.stringify(settings)).not.toContain('a-real-secret');
	});

	it('clears the password when given an empty value', () => {
		setGmailPassword('something');
		expect(hasGmailPassword()).toBe(true);

		setGmailPassword('');
		expect(hasGmailPassword()).toBe(false);
		expect(smtpConfig().appPassword).toBe('');
	});

	it('prefers the stored password over the environment', () => {
		process.env.GMAIL_APP_PASSWORD = 'from-env';
		setGmailPassword('from-settings');

		expect(smtpConfig().appPassword).toBe('from-settings');
	});

	it('falls back to the environment when nothing is stored', () => {
		process.env.GMAIL_USER = 'env@gmail.com';
		process.env.GMAIL_APP_PASSWORD = 'from-env';

		expect(smtpConfig().appPassword).toBe('from-env');
		expect(smtpConfig().user).toBe('env@gmail.com');
	});

	it('flags an unreadable password so the UI can ask for it again', () => {
		setGmailPassword('locked-away');

		process.env.ADMIN_PASSWORD = 'rotated';
		try {
			const smtp = smtpConfig();
			expect(smtp.appPassword).toBe('');
			expect(smtp.passwordUnreadable).toBe(true);
		} finally {
			process.env.ADMIN_PASSWORD = 'test-password';
		}
	});

	it('does not flag unreadable when the environment still has a working password', () => {
		setGmailPassword('locked-away');
		process.env.GMAIL_APP_PASSWORD = 'from-env';

		process.env.ADMIN_PASSWORD = 'rotated';
		try {
			// Sending still works, so there is nothing to warn about.
			expect(smtpConfig().passwordUnreadable).toBe(false);
			expect(smtpConfig().appPassword).toBe('from-env');
		} finally {
			process.env.ADMIN_PASSWORD = 'test-password';
		}
	});
});
