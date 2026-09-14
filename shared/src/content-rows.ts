/**
 * Reading rows out of a stored content document.
 *
 * `mergeSection` fills in top-level keys the stored document is missing, but it never
 * looks inside an array -- so a list of milestones, FAQ items, registry links or party
 * members has had nothing said about it at all. Whatever was written is what comes
 * back, including `null` in the middle of it.
 *
 * That is not hypothetical. A keyed `{#each items as item (item.id)}` reads `.id` off
 * every element before it renders anything, so one null in the array throws during
 * hydration and takes the whole page down -- which is exactly how the Wedding Party
 * page went down. These two helpers are what the guest pages use to make sure that
 * cannot happen, and they live here so each page is not inventing its own answer.
 */

/** Coerces anything to a string, because stored JSON is not a type system. */
export function asText(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** An image id, or null for anything that could not be one. */
export function asImageId(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * The usable rows in what should be an array of them.
 *
 * Anything that is not a plain object is dropped rather than repaired: there is no
 * sensible way to turn `null`, a number or a nested array into a row, and a page is
 * better off one item short than not rendering.
 */
export function asRows(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];

	return value.filter(
		(row): row is Record<string, unknown> =>
			Boolean(row) && typeof row === 'object' && !Array.isArray(row)
	);
}
