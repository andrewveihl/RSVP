/**
 * The Event Details page's fixed rows.
 *
 * The list lives here rather than inside either app because the guest page renders it
 * and the admin editor offers a switch for each row. Two copies would drift the moment
 * a row was added, and it is these ids that a stored `hiddenRows` refers to -- so the
 * ids are effectively part of the saved document and must not be renamed casually.
 */
import type { DetailsContent } from './types';

/** The keys of `DetailsContent` that hold a single row's text. */
export type DetailsTextField =
	| 'dateLine'
	| 'timeLine'
	| 'venueName'
	| 'venueAddress'
	| 'dressCode'
	| 'parking';

export interface DetailsRowSpec {
	id: string;
	label: string;
	field: DetailsTextField;
}

export const DETAILS_ROWS: DetailsRowSpec[] = [
	{ id: 'when', label: 'When', field: 'dateLine' },
	{ id: 'time', label: 'Time', field: 'timeLine' },
	{ id: 'where', label: 'Where', field: 'venueName' },
	{ id: 'address', label: 'Address', field: 'venueAddress' },
	{ id: 'dress', label: 'Dress code', field: 'dressCode' },
	{ id: 'parking', label: 'Parking', field: 'parking' }
];

export interface DetailsRow {
	id: string;
	label: string;
	value: string;
}

/**
 * Which ids are switched off, read defensively.
 *
 * The value comes out of stored JSON, so a document written by hand -- or by a future
 * version that changed the shape -- must not be able to throw on a guest-facing page.
 */
export function hiddenDetailsRows(details: DetailsContent): Set<string> {
	const stored = details.hiddenRows;
	return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
}

/**
 * The rows the guest site shows, in order.
 *
 * A row disappears two ways, and both are deliberate: switched off in the editor, or
 * simply left empty. The second has always been true, which is why the switch exists --
 * a couple who want no dress code line but want to keep the wording they drafted had
 * no way to say so without deleting the text.
 */
export function visibleDetailsRows(details: DetailsContent): DetailsRow[] {
	const hidden = hiddenDetailsRows(details);

	// Every field is coerced rather than trusted. This all comes back out of a stored
	// JSON document, and a row written by a future version -- or edited by hand into
	// `"dressCode": null` -- must not be able to throw on a page guests are reading.
	const text = (value: unknown): string => (typeof value === 'string' ? value : '');

	const standard = DETAILS_ROWS.filter((row) => !hidden.has(row.id)).map((row) => ({
		id: row.id,
		label: row.label,
		value: text(details[row.field])
	}));

	const extras = (Array.isArray(details.extras) ? details.extras : [])
		.filter((extra) => extra !== null && typeof extra === 'object')
		.map((extra, index) => ({
			// A row with no id would collide with its neighbours in the `{#each}` key.
			id: text(extra.id) || `extra-${index}`,
			label: text(extra.label),
			value: text(extra.value)
		}));

	return [...standard, ...extras].filter((row) => row.value.trim() !== '');
}
