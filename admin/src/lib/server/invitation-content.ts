/**
 * The invitation's wording, with anything the couple has not written filled in from
 * what they have already told us elsewhere.
 *
 * Without this there would be three places holding "the venue" -- Settings, the Event
 * Details page, and the invitation -- and no rule about which one wins. The rule is:
 * Settings and Event Details are the wedding's facts, and the invitation *starts* from
 * them. Once a line is deliberately written on the invitation it stays written, because
 * an invitation says things like "Four in the afternoon" where a website says "4:00 pm".
 *
 * The editor loads these filled-in values, so the couple always sees concrete text
 * rather than a placeholder, and saving makes their version the one that prints.
 */
import { getSection, getSetting } from '$shared/db';
import { formatLongDate } from '$shared/format';
import type { InvitationContent } from '$shared/types';

export function invitationContent(): InvitationContent {
	const coupleNames = getSetting('couple_names');
	const stored = getSection('invitation', coupleNames);
	const details = getSection('details', coupleNames);

	const fallback = (value: string, ...candidates: string[]): string =>
		value.trim() || candidates.find((candidate) => candidate?.trim()) || '';

	return {
		...stored,
		names: fallback(stored.names, coupleNames),
		dateLine: fallback(stored.dateLine, details.dateLine, formatLongDate(getSetting('wedding_date'))),
		timeLine: fallback(stored.timeLine, details.timeLine),
		venueName: fallback(stored.venueName, getSetting('venue_name'), details.venueName),
		venueAddress: fallback(stored.venueAddress, getSetting('venue_address'), details.venueAddress)
	};
}
