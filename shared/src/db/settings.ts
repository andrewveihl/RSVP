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
	'accent_color'
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
		default:
			return '';
	}
}

export function getSetting(key: SettingKey): string {
	const stored = getRawSetting(key);
	if (stored !== null && stored !== '') return stored;
	return environmentDefault(key);
}

/** The full effective settings map: stored values over environment defaults. */
export function effectiveSettings(): Record<SettingKey, string> {
	return Object.fromEntries(SETTING_KEYS.map((key) => [key, getSetting(key)])) as Record<
		SettingKey,
		string
	>;
}
