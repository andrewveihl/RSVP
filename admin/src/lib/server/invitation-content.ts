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
import { asRows, asText } from '$shared/content-rows';
import { formatLongDate } from '$shared/format';
import type { InvitationContent, InvitationLine } from '$shared/types';

const LINE_STYLES: InvitationLine['style'][] = ['display', 'body', 'small'];
const LINE_SLOTS: InvitationLine['slot'][] = ['top', 'middle', 'bottom'];

export function invitationContent(): InvitationContent {
	const coupleNames = getSetting('couple_names');
	const stored = getSection('invitation', coupleNames);
	const details = getSection('details', coupleNames);

	const fallback = (value: string, ...candidates: string[]): string =>
		value.trim() || candidates.find((candidate) => candidate?.trim()) || '';

	return {
		...stored,
		// Normalised before the editor sees it. `lines` is an array inside a stored
		// document, so `mergeSection` has said nothing about what is in it -- and the
		// editor keys its list on `line.id` while the preview reads `line.text`, either
		// of which throws on a null. This is also the screen somebody would come to in
		// order to repair that, so it has to open.
		lines: asRows(stored.lines).map((line, index) => ({
			id: asText(line.id) || `line-${index}`,
			text: asText(line.text),
			style: LINE_STYLES.includes(line.style as InvitationLine['style'])
				? (line.style as InvitationLine['style'])
				: 'body',
			slot: LINE_SLOTS.includes(line.slot as InvitationLine['slot'])
				? (line.slot as InvitationLine['slot'])
				: 'bottom'
		})),
		ceremonyLabel: asText(stored.ceremonyLabel),
		receptionName: asText(stored.receptionName),
		receptionAddress: asText(stored.receptionAddress),
		receptionLabel: asText(stored.receptionLabel),
		names: fallback(stored.names, coupleNames),
		dateLine: fallback(stored.dateLine, details.dateLine, formatLongDate(getSetting('wedding_date'))),
		timeLine: fallback(stored.timeLine, details.timeLine),
		venueName: fallback(stored.venueName, getSetting('venue_name'), details.venueName),
		venueAddress: fallback(stored.venueAddress, getSetting('venue_address'), details.venueAddress)
	};
}
