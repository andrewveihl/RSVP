import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import {
	effectiveSettings,
	hasGmailPassword,
	logActivity,
	setGmailPassword,
	setSetting,
	smtpConfig,
	type SettingKey
} from '$shared/db';
import { getConfig } from '$shared/config';
import { cleanText, normaliseEmail } from '$shared/sanitize';
import { isMailConfigured, sendTestEmail } from '$shared/mailer';

/** Everything the Settings form may write, and how each value is cleaned. */
const EDITABLE: { key: SettingKey; label: string; clean: (value: FormDataEntryValue | null) => string }[] = [
	{ key: 'couple_names', label: 'Names', clean: (value) => cleanText(value, { max: 120 }) },
	{ key: 'wedding_date', label: 'Wedding date', clean: (value) => cleanText(value, { max: 40 }) },
	{ key: 'rsvp_deadline', label: 'RSVP deadline', clean: (value) => cleanText(value, { max: 40 }) },
	{ key: 'venue_name', label: 'Venue', clean: (value) => cleanText(value, { max: 160 }) },
	{
		key: 'venue_address',
		label: 'Venue address',
		clean: (value) => cleanText(value, { multiline: true, max: 400 })
	},
	{ key: 'contact_email', label: 'Contact email', clean: (value) => normaliseEmail(value) ?? '' },
	{ key: 'invitation_width_in', label: 'Invitation width', clean: (value) => cleanText(value, { max: 10 }) },
	{ key: 'invitation_height_in', label: 'Invitation height', clean: (value) => cleanText(value, { max: 10 }) },
	{ key: 'backup_retention_days', label: 'Backup retention', clean: (value) => cleanText(value, { max: 5 }) },
	{ key: 'gmail_user', label: 'Gmail address', clean: (value) => normaliseEmail(value) ?? '' },
	{ key: 'gmail_from_name', label: 'Sender name', clean: (value) => cleanText(value, { max: 120 }) }
];

export const load: PageServerLoad = () => {
	const smtp = smtpConfig();

	return {
		settings: effectiveSettings(),
		mailConfigured: isMailConfigured(),
		// Never the password itself -- only whether one exists, and whether this
		// ADMIN_PASSWORD can still decrypt it.
		passwordStored: hasGmailPassword(),
		passwordUnreadable: smtp.passwordUnreadable,
		// True when the password comes from .env rather than the Settings screen, so the
		// UI can say so instead of showing an empty field beside a working setup.
		passwordFromEnv: Boolean(getConfig().smtp.appPassword) && !hasGmailPassword(),
		smtpUser: smtp.user,
		fromName: smtp.fromName,
		smtpHost: smtp.host,
		smtpPort: smtp.port,
		siteUrl: getConfig().siteUrl,
		adminUrl: getConfig().adminUrl,
		sessionMinutes: Math.round(getConfig().adminSessionTtlMs / 60_000)
	};
};

export const actions: Actions = {
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const changed: string[] = [];

		for (const field of EDITABLE) {
			if (!result.form.has(field.key)) continue;
			const value = field.clean(result.form.get(field.key));
			setSetting(field.key, value);
			changed.push(field.label);
		}

		logActivity({
			eventType: 'settings_changed',
			description: `Changed settings: ${changed.join(', ')}`,
			ipAddress: event.locals.clientIp
		});

		return { success: 'Settings saved.' };
	},

	/**
	 * Stores the Gmail app password, encrypted.
	 *
	 * Kept as its own action so the main Save never has to carry a credential, and so an
	 * empty field there cannot silently wipe a working one.
	 */
	saveGmailPassword: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		// Not `cleanText`: an app password is sixteen characters that Google displays in
		// four groups, and people paste the spaces. Only those are stripped.
		const raw = (result.form.get('appPassword')?.toString() ?? '').replace(/\s+/g, '');

		const outcome = setGmailPassword(raw);
		if (!outcome.ok) return fail(400, { error: outcome.error ?? 'Could not save the password.' });

		// Never log the value, nor its length.
		logActivity({
			eventType: 'settings_changed',
			description: raw ? 'Set the Gmail app password' : 'Removed the Gmail app password',
			ipAddress: event.locals.clientIp
		});

		return {
			success: raw
				? 'Gmail app password saved. Send yourself a test to confirm it works.'
				: 'Gmail app password removed.'
		};
	},

	testEmail: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		// Defaults to whichever address is actually configured -- which, now that Gmail
		// can be set in the app, is not necessarily the one in .env.
		const to = normaliseEmail(result.form.get('to')) ?? smtpConfig().user;
		if (!to) return fail(400, { error: 'Give an address to send the test to.' });

		const outcome = await sendTestEmail(to);
		if (!outcome.ok) return fail(400, { error: `Gmail refused it: ${outcome.error}` });

		return { success: `Test email sent to ${to}. If it does not arrive, check spam.` };
	}
};
