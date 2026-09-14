/**
 * The wedding party, as the guest page needs it: normalised, then split into blocks.
 *
 * Both rules live here rather than in the markup because both are about the stored
 * document rather than about layout -- what counts as a usable member, what counts as
 * the same group, and what happens to a member nobody grouped.
 */
import type { PartyMember } from './types';

/** Coerces anything to a string, because stored JSON is not a type system. */
function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * The members worth showing, with every field guaranteed present.
 *
 * This exists because the page crashed. It called `member.name.trim()` on a member
 * whose name was missing, and an uncaught TypeError during hydration does not degrade
 * gracefully -- it took the whole page down for every visitor, over one bad row in a
 * JSON document.
 *
 * The admin editor already refuses to save a member without a name, so nothing *should*
 * reach here in that state. "Should" is the problem: this is stored JSON, it survives
 * schema changes, and it can be edited by hand or written by a version that thought
 * differently. A public page reading it has to treat it as data rather than as a
 * promise.
 *
 * A member with no name is dropped rather than rendered blank: there is nothing to put
 * on the card, and an empty one in the row reads as a mistake either way.
 */
export function visiblePartyMembers(members: unknown): PartyMember[] {
	const rows = Array.isArray(members) ? members : [];

	return rows
		.filter((member): member is Partial<PartyMember> => Boolean(member) && typeof member === 'object')
		.map((member, index) => ({
			// An id is what the `{#each}` keys on, so a missing one would collide.
			id: text(member.id) || `member-${index}`,
			name: text(member.name).trim(),
			role: text(member.role),
			group: text(member.group),
			bio: text(member.bio),
			imageId: typeof member.imageId === 'string' ? member.imageId : null
		}))
		.filter((member) => member.name !== '');
}

/**
 * The initial shown when a member has no photo.
 *
 * Takes the whole first character rather than `charAt(0)`, so a name beginning outside
 * the BMP keeps its letter instead of half a surrogate pair -- and answers an empty
 * string rather than throwing when there is no name to take one from.
 */
export function partyInitial(name: string): string {
	return [...text(name).trim()][0]?.toUpperCase() ?? '';
}

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
		const label = text(member.group).trim();
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
