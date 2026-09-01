/**
 * The values behind the `{{merge_fields}}` in a reminder email.
 *
 * One place, so a preview in the template editor and the message that actually goes
 * out are rendered from identical inputs -- a preview that differs from the send is
 * worse than no preview at all.
 */
import { getConfig, rsvpDeadlineDate } from '$shared/config';
import { getSection, getSetting } from '$shared/db';
import { formatLongDate } from '$shared/format';
import type { ContextSource } from '$shared/email-template';

export function mergeSource(): ContextSource {
	const coupleNames = getSetting('couple_names');
	const details = getSection('details', coupleNames);
	const deadline = rsvpDeadlineDate(getSetting('rsvp_deadline'));

	return {
		siteUrl: getConfig().siteUrl,
		weddingDate: details.dateLine || formatLongDate(getSetting('wedding_date')),
		venue: getSetting('venue_name') || details.venueName,
		deadline: deadline ? formatLongDate(deadline) : 'the date on your invitation',
		coupleNames
	};
}
