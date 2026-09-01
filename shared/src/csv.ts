/**
 * CSV parsing, column mapping and export.
 *
 * The parser is hand-written rather than pulled from npm because the tricky parts of
 * RFC 4180 are exactly the parts a guest list hits -- a quoted address containing a
 * comma, a name containing a doubled quote -- and those are 60 lines and a unit test,
 * not a dependency with its own release cadence.
 */
import { normaliseEmail, cleanText, parseInteger } from './sanitize';

export interface ParsedCsv {
	headers: string[];
	rows: string[][];
}

/**
 * Splits CSV text into a header row and data rows.
 *
 * Handles quoted fields, escaped quotes (`""`), embedded newlines and commas, and both
 * CRLF and LF line endings. A UTF-8 BOM is stripped -- Excel writes one, and without
 * this the first header would read as U+FEFF followed by "Name" and never match a mapping.
 */
export function parseCsv(text: string): ParsedCsv {
	const input = text.replace(/^\uFEFF/, '');
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let index = 0;

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		// A trailing newline produces one final empty row; drop it rather than
		// importing a blank household.
		if (row.length > 1 || row[0].trim() !== '') rows.push(row);
		row = [];
	};

	while (index < input.length) {
		const char = input[index];

		if (inQuotes) {
			if (char === '"') {
				if (input[index + 1] === '"') {
					field += '"';
					index += 2;
					continue;
				}
				inQuotes = false;
				index += 1;
				continue;
			}
			field += char;
			index += 1;
			continue;
		}

		if (char === '"' && field === '') {
			inQuotes = true;
			index += 1;
			continue;
		}
		if (char === ',') {
			pushField();
			index += 1;
			continue;
		}
		if (char === '\r' && input[index + 1] === '\n') {
			pushRow();
			index += 2;
			continue;
		}
		if (char === '\n' || char === '\r') {
			pushRow();
			index += 1;
			continue;
		}

		field += char;
		index += 1;
	}

	if (field !== '' || row.length > 0) pushRow();

	const headers = rows.shift() ?? [];
	return { headers: headers.map((header) => header.trim()), rows };
}

/** The household fields an imported column can be mapped onto. */
export const IMPORT_FIELDS = [
	'name',
	'email',
	'phone',
	'mailingAddress',
	'partySize',
	'batch',
	'notes',
	'skip'
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
	name: 'Household name',
	email: 'Email',
	phone: 'Phone',
	mailingAddress: 'Mailing address',
	partySize: 'Party size',
	batch: 'Batch / group',
	notes: 'Notes',
	skip: 'Skip this column'
};

/**
 * Guesses a mapping from a header's wording, so the common export from a spreadsheet
 * arrives already mapped and the admin only corrects the odd one.
 *
 * Order matters: 'name' appears inside 'venue name' and inside plenty of other
 * headers, so the more specific patterns are tested first.
 */
const HEADER_PATTERNS: [RegExp, ImportField][] = [
	[/^(e-?mail|email address)$/i, 'email'],
	[/e-?mail/i, 'email'],
	[/(phone|mobile|cell|tel)/i, 'phone'],
	[/(address|street|mailing|city|zip|postal)/i, 'mailingAddress'],
	[/(party|guests?|seats|size|count|headcount|number)/i, 'partySize'],
	[/(batch|group|tier|wave|round)/i, 'batch'],
	[/(notes?|comment|remark)/i, 'notes'],
	[/(household|family|full ?name|guest ?name|invitee|^name$)/i, 'name']
];

export function guessField(header: string): ImportField {
	const trimmed = header.trim();
	if (!trimmed) return 'skip';
	for (const [pattern, field] of HEADER_PATTERNS) {
		if (pattern.test(trimmed)) return field;
	}
	return 'skip';
}

export function guessMapping(headers: string[]): ImportField[] {
	const used = new Set<ImportField>();
	return headers.map((header) => {
		const guess = guessField(header);
		// Two columns cannot both be the name; the first wins and the rest are skipped
		// so the preview never shows an impossible mapping.
		if (guess !== 'skip' && used.has(guess)) return 'skip';
		if (guess !== 'skip') used.add(guess);
		return guess;
	});
}

export interface ImportCandidate {
	name: string;
	email: string | null;
	phone: string | null;
	mailingAddress: string | null;
	partySize: number;
	batch: string | null;
	notes: string | null;
	/** 1-based row number in the source file, for error messages. */
	line: number;
}

export interface ImportProblem {
	line: number;
	message: string;
}

export interface MappedImport {
	candidates: ImportCandidate[];
	problems: ImportProblem[];
	/** Names that appear more than once inside the file itself. */
	duplicatesInFile: string[];
}

/**
 * Applies a mapping to parsed rows, producing validated candidates plus the problems
 * worth showing before anything is written.
 *
 * Nothing is inserted here: the admin sees the outcome first and confirms. A row with
 * no household name is reported rather than silently dropped, because a mis-mapped
 * name column would otherwise import an entire file of blank guests without a word.
 */
export function mapRows(rows: string[][], mapping: ImportField[]): MappedImport {
	const candidates: ImportCandidate[] = [];
	const problems: ImportProblem[] = [];
	const seen = new Map<string, string>();
	const duplicatesInFile: string[] = [];

	if (!mapping.includes('name')) {
		return {
			candidates: [],
			problems: [{ line: 0, message: 'Map one column to the household name before importing.' }],
			duplicatesInFile: []
		};
	}

	rows.forEach((row, index) => {
		const line = index + 2; // +1 for zero-indexing, +1 for the header row.
		const pick = (field: ImportField): string => {
			const column = mapping.indexOf(field);
			return column === -1 ? '' : (row[column] ?? '');
		};

		const name = cleanText(pick('name'));
		if (!name) {
			// A wholly blank row is just spreadsheet padding -- skip it quietly.
			if (row.every((cell) => cell.trim() === '')) return;
			problems.push({ line, message: 'No household name in this row.' });
			return;
		}

		const rawEmail = cleanText(pick('email'));
		const email = rawEmail ? normaliseEmail(rawEmail) : null;
		if (rawEmail && !email) {
			// Not fatal: import the household without the address rather than losing them.
			problems.push({ line, message: `"${rawEmail}" is not a valid email address; importing without it.` });
		}

		const rawSize = cleanText(pick('partySize'));
		const partySize = rawSize ? parseInteger(rawSize, { min: 1, max: 50 }) : 1;
		if (rawSize && partySize === null) {
			problems.push({ line, message: `"${rawSize}" is not a valid party size; using 1.` });
		}

		// Reported under the spelling of the *first* occurrence, which is the one the
		// admin will recognise from the row above rather than a lower-cased repeat.
		const key = name.toLowerCase();
		const firstSpelling = seen.get(key);
		if (firstSpelling !== undefined) {
			if (!duplicatesInFile.includes(firstSpelling)) duplicatesInFile.push(firstSpelling);
		} else {
			seen.set(key, name);
		}

		candidates.push({
			name,
			email,
			phone: cleanText(pick('phone')) || null,
			mailingAddress: cleanText(pick('mailingAddress'), { multiline: true }) || null,
			partySize: partySize ?? 1,
			batch: cleanText(pick('batch')) || null,
			notes: cleanText(pick('notes'), { multiline: true }) || null,
			line
		});
	});

	return { candidates, problems, duplicatesInFile };
}

// --- Export -----------------------------------------------------------------

/**
 * Quotes one field for output.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a single quote: spreadsheets treat
 * those as the start of a formula, so a guest whose notes begin `=cmd|...` would
 * otherwise become a CSV injection the moment the couple opened the export in Excel.
 */
export function csvField(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value);
	const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
	if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
	return guarded;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
	const lines = [headers.map(csvField).join(',')];
	for (const row of rows) lines.push(row.map(csvField).join(','));
	// CRLF, because that is what Excel expects and every other tool tolerates.
	return `${lines.join('\r\n')}\r\n`;
}
