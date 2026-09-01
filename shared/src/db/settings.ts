/**
 * Runtime settings, editable from the admin panel.
 *
 * These shadow the environment variables of the same meaning. The environment is the
 * deployment's default; a row here is the couple changing their mind at 11pm without
 * wanting to edit `.env` and restart two containers. So the read order is
 * database -> environment -> hard-coded default, and `getSetting` is what every caller
 * uses rather than reading `getConfig()` directly for these particular values.
 */
import { getConfig } from '../config';
import { canStoreSecrets, decryptSecret, encryptSecret } from '../secrets';
import { getDb } from './connection';

export const SETTING_KEYS = [
	'rsvp_deadline',
	'wedding_date',
	'couple_names',
	'venue_name',
	'venue_address',
	'contact_email',
	'invitation_width_in',
	'invitation_height_in',
	'backup_retention_days',
	'accent_color',
	// Gmail, so the couple can set it from the Settings screen instead of editing
	// .env and restarting a container. The app password is stored encrypted -- see
	// `smtpConfig` below and `shared/src/secrets.ts`.
	'gmail_user',
	'gmail_from_name',
	'gmail_app_password'
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export function getRawSetting(key: SettingKey): string | null {
	const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
		| { value: string }
		| undefined;
	return row?.value ?? null;
}

export function setSetting(key: SettingKey, value: string): void {
	getDb()
		.prepare(
			`INSERT INTO settings (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
		)
		.run(key, value);
}

export function deleteSetting(key: SettingKey): void {
	getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function allSettings(): Record<string, string> {
	const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
		key: string;
		value: string;
	}[];
	return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/** Environment fallbacks, so an unset row still produces the deployment's value. */
function environmentDefault(key: SettingKey): string {
	const config = getConfig();
	switch (key) {
		case 'rsvp_deadline':
			return config.rsvpDeadline;
		case 'wedding_date':
			return config.weddingDate;
		case 'couple_names':
			return config.coupleNames;
		case 'contact_email':
			return config.contactEmail;
		case 'invitation_width_in':
			return '5';
		case 'invitation_height_in':
			return '7';
		case 'backup_retention_days':
			return String(config.backupRetentionDays);
		case 'accent_color':
			return '#8A9A7B';
		case 'gmail_user':
			return config.smtp.user;
		case 'gmail_from_name':
			return config.smtp.fromName;
		case 'gmail_app_password':
			// Never surfaced through `getSetting`; see `smtpConfig`.
			return '';
		default:
			return '';
	}
}

export function getSetting(key: SettingKey): string {
	const stored = getRawSetting(key);
	if (stored !== null && stored !== '') return stored;
	return environmentDefault(key);
}

/**
 * The full effective settings map: stored values over environment defaults.
 *
 * The app password is deliberately excluded. This map is handed to page loads and
 * therefore reaches the browser, and a credential has no business being there --
 * `smtpConfig` is the only way to read it, and it is used server-side only.
 */
export function effectiveSettings(): Record<SettingKey, string> {
	return Object.fromEntries(
		SETTING_KEYS.map((key) => [key, key === 'gmail_app_password' ? '' : getSetting(key)])
	) as Record<SettingKey, string>;
}

export interface SmtpConfig {
	user: string;
	appPassword: string;
	fromName: string;
	host: string;
	port: number;
	/** True when a password is stored but this ADMIN_PASSWORD cannot decrypt it. */
	passwordUnreadable: boolean;
}

/**
 * The SMTP settings actually used to send, resolved settings-over-environment.
 *
 * This lives here rather than in `config.ts` because it reads the database, and
 * `config.ts` is imported *by* the database layer -- putting it there would be a cycle.
 */
export function smtpConfig(): SmtpConfig {
	const config = getConfig();

	const stored = getRawSetting('gmail_app_password');
	const decrypted = decryptSecret(stored);

	// An environment password still works, and is the fallback when nothing is stored.
	const appPassword = decrypted.ok ? decrypted.value : config.smtp.appPassword;

	return {
		user: getSetting('gmail_user'),
		fromName: getSetting('gmail_from_name'),
		appPassword,
		host: config.smtp.host,
		port: config.smtp.port,
		passwordUnreadable: Boolean(stored) && !decrypted.ok && !config.smtp.appPassword
	};
}

/** Stores the app password encrypted, or clears it when given an empty string. */
export function setGmailPassword(plaintext: string): { ok: boolean; error?: string } {
	if (!plaintext) {
		deleteSetting('gmail_app_password');
		return { ok: true };
	}

	if (!canStoreSecrets()) {
		return {
			ok: false,
			error: 'ADMIN_PASSWORD is not set on the server, so there is no key to encrypt with.'
		};
	}

	const encrypted = encryptSecret(plaintext);
	if (!encrypted) return { ok: false, error: 'Could not encrypt the password.' };

	setSetting('gmail_app_password', encrypted);
	return { ok: true };
}

/** Whether a password is stored at all, without revealing or decrypting it. */
export function hasGmailPassword(): boolean {
	return Boolean(getRawSetting('gmail_app_password'));
}
