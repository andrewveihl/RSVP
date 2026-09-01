import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { getSetting, listHouseholds, logActivity, setSection } from '$shared/db';
import { invitationContent } from '$lib/server/invitation-content';
import { getConfig } from '$shared/config';
import { CARD_PRESETS } from '$shared/invitations';
import { cleanText } from '$shared/sanitize';
import { hexToTriplet } from '$shared/theme';
import type { InvitationContent } from '$shared/types';

export const load: PageServerLoad = ({ url }) => {
	// The guests page links here with a pre-made selection, so a batch flows straight
	// from "these fifty" to "one PDF of these fifty".
	const preselected = (url.searchParams.get('ids') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	return {
		households: listHouseholds({ sort: 'name' }),
		preselected,
		presets: Object.entries(CARD_PRESETS).map(([key, preset]) => ({ key, ...preset })),
		defaults: {
			width: getSetting('invitation_width_in'),
			height: getSetting('invitation_height_in')
		},
		// Filled in from Settings and Event Details wherever the couple has not written
		// their own line, so the editor never shows a blank the preview then contradicts.
		invitation: invitationContent(),
		siteUrl: getConfig().siteUrl
	};
};

export const actions: Actions = {
	/**
	 * Saves the wording and styling. The preview is rendered live in the browser from
	 * the same layout code, so this only has to store what the admin settled on.
	 */
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const form = result.form;
		const text = (name: string, max = 200) => cleanText(form.get(name), { max });

		const accent = text('accent', 9);
		const font = form.get('font') === 'sans' ? 'sans' : 'serif';

		const invitation: InvitationContent = {
			eyebrow: text('eyebrow', 120),
			names: text('names', 120),
			inviteLine: text('inviteLine', 160),
			dateLine: text('dateLine', 120),
			timeLine: text('timeLine', 120),
			venueName: text('venueName', 160),
			venueAddress: cleanText(form.get('venueAddress'), { multiline: true, max: 300 }),
			qrCaption: text('qrCaption', 60),
			showUrl: form.get('showUrl') === '1',
			showQr: form.get('showQr') === '1',
			showBorder: form.get('showBorder') === '1',
			font,
			// An unparseable colour is refused rather than stored, or every future render
			// would silently fall back and the admin would never know why.
			accent: hexToTriplet(accent) ? accent : '#8A9A7B'
		};

		if (!invitation.names.trim()) {
			return fail(400, { error: 'The invitation needs at least a name on it.' });
		}

		setSection('invitation', invitation);
		logActivity({
			eventType: 'content_changed',
			description: 'Edited the invitation design',
			ipAddress: event.locals.clientIp
		});

		return { success: 'Invitation saved.' };
	}
};
