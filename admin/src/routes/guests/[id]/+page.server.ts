import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import {
	getHouseholdWithRsvp,
	listActivity,
	listEmailLog,
	logActivity,
	regenerateToken
} from '$shared/db';
import { getConfig } from '$shared/config';
import { rsvpUrl } from '$shared/tokens';
import { qrDataUrl } from '$shared/qr';

export const load: PageServerLoad = async ({ params }) => {
	const household = getHouseholdWithRsvp(params.id);
	if (!household) error(404, 'That household does not exist.');

	const link = rsvpUrl(getConfig().siteUrl, household.token);

	return {
		household,
		link,
		// Inlined as a data URL rather than fetched: it saves a round trip, and the
		// admin CSP already permits `data:` images for exactly this.
		qr: await qrDataUrl(link, { size: 320 }),
		activity: listActivity({ householdId: household.id, limit: 50 }),
		emails: listEmailLog({ householdId: household.id, limit: 50 })
	};
};

export const actions: Actions = {
	/**
	 * Issues a new token, which invalidates every link and QR code already handed out
	 * for this household. Worth having when a link ends up somewhere public, and worth
	 * confirming twice, which the page does.
	 */
	rotateToken: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const household = getHouseholdWithRsvp(event.params.id);
		if (!household) return fail(404, { error: 'That household no longer exists.' });

		const token = regenerateToken(household.id);
		if (!token) return fail(500, { error: 'Could not issue a new link.' });

		logActivity({
			eventType: 'guest_edited',
			description: `Issued a new RSVP link for ${household.name}`,
			householdId: household.id,
			ipAddress: event.locals.clientIp
		});

		return { success: 'New link issued. Any previous invitation for this household is now dead.' };
	}
};
