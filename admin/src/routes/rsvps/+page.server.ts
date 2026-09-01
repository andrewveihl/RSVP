import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import { deleteRsvp, getHousehold, getHouseholdWithRsvp, listHouseholds, logActivity } from '$shared/db';
import { submitRsvp } from '$shared/rsvp-service';
import { isRsvpClosed } from '$shared/config';
import { getSetting } from '$shared/db';

export const load: PageServerLoad = ({ url }) => {
	const householdId = url.searchParams.get('household');

	return {
		// Everyone, ordered by most recently touched: a reply that just came in, or one
		// the admin is about to enter, is what they are looking at.
		households: listHouseholds({ sort: 'updated_at', direction: 'desc' }),
		editing: householdId ? getHouseholdWithRsvp(householdId) : null,
		closed: isRsvpClosed(new Date(), getSetting('rsvp_deadline'))
	};
};

export const actions: Actions = {
	/**
	 * Records or replaces a reply on a household's behalf -- for the ones who phone,
	 * or who answer after the deadline.
	 *
	 * `asAdmin` is what makes the deadline soft: the same validation runs, but the
	 * cut-off does not apply. The activity entry says it came from the admin, so the
	 * log still distinguishes a guest's own reply from one typed in for them.
	 */
	save: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const householdId = result.form.get('householdId')?.toString() ?? '';
		const household = getHousehold(householdId);
		if (!household) return fail(404, { error: 'That household no longer exists.' });

		const outcome = submitRsvp(
			{
				attending: result.form.get('attending'),
				guestTotal: result.form.get('guestTotal')
			},
			{
				household,
				ipAddress: event.locals.clientIp,
				userAgent: 'admin',
				asAdmin: true
			}
		);

		if (!outcome.ok) return fail(400, { error: outcome.error });

		return { success: `Saved the reply for ${household.name}.` };
	},

	clear: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const householdId = result.form.get('householdId')?.toString() ?? '';
		const household = getHousehold(householdId);
		if (!household) return fail(404, { error: 'That household no longer exists.' });

		if (!deleteRsvp(householdId)) return fail(404, { error: 'There was no reply to clear.' });

		logActivity({
			eventType: 'rsvp_updated',
			description: `Cleared the reply for ${household.name}`,
			householdId,
			ipAddress: event.locals.clientIp
		});

		return { success: `${household.name} is back to awaiting a reply.` };
	}
};
