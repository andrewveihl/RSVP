/**
 * Assembles the wording printed on an invitation from settings and site content, so
 * the invitation, the guest site and the reminder emails all quote the same date and
 * the same venue.
 */
import { getConfig } from '$shared/config';
import { getSection, getSetting } from '$shared/db';
import { formatLongDate } from '$shared/format';
import type { InvitationDetails } from '$shared/invitations';

export function invitationDetails(): InvitationDetails {
	const coupleNames = getSetting('couple_names');
	const details = getSection('details', coupleNames);

	return {
		coupleNames,
		// The stored date line is the couple's own wording and wins; the formatted
		// wedding date is the fallback when they have not written one.
		dateLine: details.dateLine || formatLongDate(getSetting('wedding_date')),
		timeLine: details.timeLine,
		venueName: getSetting('venue_name') || details.venueName,
		venueAddress: getSetting('venue_address') || details.venueAddress,
		siteUrl: getConfig().siteUrl
	};
}
