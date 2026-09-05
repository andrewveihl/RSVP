import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import {
	FIELD_LABELS,
	IMPORT_FIELDS,
	guessMapping,
	mapRows,
	parseCsv,
	type ImportField
} from '$shared/csv';
import { createHousehold, findHouseholdByName, logActivity, updateHousehold } from '$shared/db';
import { getDb } from '$shared/db';

/** A guest list is a few hundred rows; anything much larger is not one. */
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const PREVIEW_ROWS = 8;

export const load: PageServerLoad = () => ({
	fields: IMPORT_FIELDS.map((field) => ({ value: field, label: FIELD_LABELS[field] }))
});

function readMapping(form: FormData, columnCount: number): ImportField[] {
	return Array.from({ length: columnCount }, (_, index) => {
		const raw = form.get(`map_${index}`)?.toString() ?? 'skip';
		// Only a value from the known list is ever honoured.
		return (IMPORT_FIELDS as readonly string[]).includes(raw) ? (raw as ImportField) : 'skip';
	});
}

export const actions: Actions = {
	/**
	 * Step one: parse the upload and propose a mapping.
	 *
	 * Nothing is written here. The parsed text is handed back to the browser in a
	 * hidden field so step two can re-parse it without a server-side session or a
	 * temporary file -- there is exactly one admin, and a two-megabyte round trip is
	 * cheaper than either.
	 */
	preview: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const file = result.form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose a CSV file to upload.' });
		}
		if (file.size > MAX_CSV_BYTES) {
			return fail(400, { error: 'That file is larger than 2MB. Is it really a guest list?' });
		}

		const text = await file.text();
		const parsed = parseCsv(text);

		if (parsed.headers.length === 0 || parsed.rows.length === 0) {
			return fail(400, { error: 'That file has no header row and rows beneath it.' });
		}

		const mapping = guessMapping(parsed.headers);
		const mapped = mapRows(parsed.rows, mapping);

		return {
			stage: 'preview' as const,
			csv: text,
			headers: parsed.headers,
			sample: parsed.rows.slice(0, PREVIEW_ROWS),
			rowCount: parsed.rows.length,
			mapping,
			problems: mapped.problems.slice(0, 20),
			problemCount: mapped.problems.length,
			duplicatesInFile: mapped.duplicatesInFile,
			existingDuplicates: mapped.candidates
				.filter((candidate) => findHouseholdByName(candidate.name))
				.map((candidate) => candidate.name)
		};
	},

	/**
	 * Step two: apply the confirmed mapping.
	 *
	 * The whole import runs in one transaction, so a bad row a hundred lines in cannot
	 * leave the guest list half-imported and the admin unsure what to re-run.
	 */
	confirm: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const text = result.form.get('csv')?.toString() ?? '';
		if (!text) return fail(400, { error: 'The upload was lost. Please choose the file again.' });

		const parsed = parseCsv(text);
		const mapping = readMapping(result.form, parsed.headers.length);
		const mapped = mapRows(parsed.rows, mapping);

		if (mapped.candidates.length === 0) {
			return fail(400, {
				error: mapped.problems[0]?.message ?? 'Nothing in that file could be imported.'
			});
		}

		const onDuplicate = result.form.get('onDuplicate')?.toString() ?? 'skip';

		let created = 0;
		let updated = 0;
		let skipped = 0;

		getDb().transaction(() => {
			for (const candidate of mapped.candidates) {
				const existing = findHouseholdByName(candidate.name);

				if (existing) {
					if (onDuplicate === 'update') {
						// The token is deliberately left alone: overwriting it would break an
						// invitation that has already gone in the post.
						updateHousehold(existing.id, {
							email: candidate.email,
							phone: candidate.phone,
							mailingAddress: candidate.mailingAddress,
							partySize: candidate.partySize,
							maxExtraGuests: candidate.maxExtraGuests,
							batch: candidate.batch,
							notes: candidate.notes
						});
						updated += 1;
					} else {
						skipped += 1;
					}
					continue;
				}

				createHousehold(candidate);
				created += 1;
			}
		})();

		logActivity({
			eventType: 'csv_imported',
			description: `Imported ${created} household(s) from CSV (${updated} updated, ${skipped} skipped)`,
			metadata: { created, updated, skipped, rows: mapped.candidates.length },
			ipAddress: event.locals.clientIp
		});

		return {
			stage: 'done' as const,
			success: `Imported ${created} new household(s). ${updated} updated, ${skipped} skipped.`,
			created,
			updated,
			skipped
		};
	}
};
