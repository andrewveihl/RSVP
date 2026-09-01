import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { effectiveSettings, logActivity, setSetting, type SettingKey } from '$shared/db';
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
	{ key: 'backup_retention_days', label: 'Backup retention', clean: (value) => cleanText(value, { max: 5 }) }
];

export const load: PageServerLoad = () => ({
	settings: effectiveSettings(),
	mailConfigured: isMailConfigured(),
	smtpUser: getConfig().smtp.user,
	fromName: getConfig().smtp.fromName,
	siteUrl: getConfig().siteUrl,
	adminUrl: getConfig().adminUrl,
	sessionMinutes: Math.round(getConfig().adminSessionTtlMs / 60_000)
});

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

	testEmail: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const to = normaliseEmail(result.form.get('to')) ?? getConfig().smtp.user;
		if (!to) return fail(400, { error: 'Give an address to send the test to.' });

		const outcome = await sendTestEmail(to);
		if (!outcome.ok) return fail(400, { error: `Gmail refused it: ${outcome.error}` });

		return { success: `Test email sent to ${to}. If it does not arrive, check spam.` };
	}
};
