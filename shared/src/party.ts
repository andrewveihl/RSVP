/**
 * How the wedding party is split into blocks on the guest page.
 *
 * The couple type a group name against each member -- "Bridesmaids", "Groomsmen" --
 * and the page draws one block per distinct name. It lives here rather than in the
 * page because it is a rule about the stored document, not about markup: what counts
 * as the same group, and what happens to a member nobody grouped.
 */
import type { PartyMember } from './types';

export interface PartyGroup {
	/** The heading to print, or empty for the members nobody put in a group. */
	label: string;
	members: PartyMember[];
}

/**
 * The party in blocks, in the order the couple arranged them.
 *
 * Groups appear in the order their first member does, so the one list of members --
 * with its Up and Down buttons -- stays the single place the order is decided. The
 * `group` field is read defensively: it arrives from stored JSON, and a document
 * written before the field existed must not be able to throw on a guest-facing page.
 */
export function partyGroups(members: PartyMember[]): PartyGroup[] {
	const groups: PartyGroup[] = [];

	for (const member of members) {
		const label = typeof member.group === 'string' ? member.group.trim() : '';
		// Case-insensitive: "Groomsmen" and "groomsmen" are one block, and the first
		// spelling is the one that gets printed.
		const existing = groups.find((group) => group.label.toLowerCase() === label.toLowerCase());

		if (existing) existing.members.push(member);
		else groups.push({ label, members: [member] });
	}

	return groups;
}

/**
 * Whether the party is arranged in named blocks at all.
 *
 * This is the switch between the two layouts: everyone together four to a row, or
 * each named block two to a row so bridesmaids and groomsmen sit side by side.
 */
export function isPartyGrouped(groups: PartyGroup[]): boolean {
	return groups.some((group) => group.label !== '');
}
