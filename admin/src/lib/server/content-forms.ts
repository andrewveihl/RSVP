/**
 * Reading repeated rows out of a form.
 *
 * The content editor's lists -- milestones, party members, registry links, FAQ items --
 * all submit as indexed fields (`row_0_title`, `row_1_title`, ...). Rows are added and
 * removed in the browser, so the indices arrive with gaps in them; walking a declared
 * `row_count` and skipping the blanks is what tolerates that, where a naive
 * `while (form.has(...))` would stop at the first hole and silently drop the rest.
 */
import { cleanText, optionalText, safeUrl } from '$shared/sanitize';

export interface RowReader {
	/** Field value for this row, cleaned to a single line. */
	text(field: string, max?: number): string;
	/** Field value allowing newlines. */
	multiline(field: string, max?: number): string;
	/** Field value as an http(s) URL, or an empty string. */
	url(field: string): string;
	/** The row's stable id, kept across edits so image references survive. */
	id(fallback: string): string;
}

export function readRows(form: FormData, prefix: string, limit = 200): RowReader[] {
	const declared = Number.parseInt(form.get(`${prefix}_count`)?.toString() ?? '0', 10);
	const count = Number.isFinite(declared) ? Math.min(Math.max(0, declared), limit) : 0;

	const rows: RowReader[] = [];

	for (let index = 0; index < count; index += 1) {
		const key = (field: string) => `${prefix}_${index}_${field}`;
		// A row whose id field is absent was removed in the browser; the gap is skipped.
		if (!form.has(key('id'))) continue;

		rows.push({
			text: (field, max = 300) => cleanText(form.get(key(field)), { max }),
			multiline: (field, max = 4000) => cleanText(form.get(key(field)), { multiline: true, max }),
			url: (field) => safeUrl(form.get(key(field))) ?? '',
			id: (fallback) => optionalText(form.get(key('id')), { max: 64 }) ?? fallback
		});
	}

	return rows;
}

/** A stable id for a newly added row, unique enough within one document. */
export function newRowId(prefix: string, index: number): string {
	return `${prefix}-${Date.now().toString(36)}-${index}`;
}
