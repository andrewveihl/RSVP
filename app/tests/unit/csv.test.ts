import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropDatabase, freshDatabase } from './helpers';
import { csvField, guessField, guessMapping, mapRows, parseCsv, toCsv } from '$shared/csv';

beforeEach(freshDatabase);
afterEach(dropDatabase);

describe('parseCsv', () => {
	it('parses a plain file', () => {
		const parsed = parseCsv('Name,Email\nSmith,a@example.com\nJones,b@example.com\n');

		expect(parsed.headers).toEqual(['Name', 'Email']);
		expect(parsed.rows).toEqual([
			['Smith', 'a@example.com'],
			['Jones', 'b@example.com']
		]);
	});

	it('handles quoted fields containing commas, quotes and newlines', () => {
		const text = 'Name,Address\n"Smith, John","12 High St\nAnytown"\n"The ""Big"" Family",Elsewhere\n';
		const parsed = parseCsv(text);

		expect(parsed.rows[0]).toEqual(['Smith, John', '12 High St\nAnytown']);
		expect(parsed.rows[1][0]).toBe('The "Big" Family');
	});

	it('strips the BOM Excel writes', () => {
		const parsed = parseCsv('﻿Name,Email\nSmith,a@example.com\n');
		// Without stripping, the first header would never match a mapping.
		expect(parsed.headers[0]).toBe('Name');
	});

	it('accepts CRLF line endings', () => {
		const parsed = parseCsv('Name,Email\r\nSmith,a@example.com\r\n');
		expect(parsed.rows).toEqual([['Smith', 'a@example.com']]);
	});

	it('does not emit a phantom row for a trailing newline', () => {
		expect(parseCsv('Name\nSmith\n').rows).toHaveLength(1);
		expect(parseCsv('Name\nSmith').rows).toHaveLength(1);
	});

	it('returns empty structures for empty input', () => {
		expect(parseCsv('')).toEqual({ headers: [], rows: [] });
	});
});

describe('column guessing', () => {
	it('recognises the usual header wordings', () => {
		expect(guessField('E-mail Address')).toBe('email');
		expect(guessField('Mobile')).toBe('phone');
		expect(guessField('Mailing Address')).toBe('mailingAddress');
		expect(guessField('Party Size')).toBe('partySize');
		expect(guessField('Household')).toBe('name');
		expect(guessField('Something else entirely')).toBe('skip');
		expect(guessField('')).toBe('skip');
	});

	it('never maps two columns to the same field', () => {
		const mapping = guessMapping(['Name', 'Household Name', 'Email']);
		expect(mapping.filter((field) => field === 'name')).toHaveLength(1);
		expect(mapping).toEqual(['name', 'skip', 'email']);
	});
});

describe('mapRows', () => {
	const mapping = ['name', 'email', 'partySize'] as const;

	it('produces validated candidates', () => {
		const { candidates } = mapRows(
			[
				['The Smiths', 'a@example.com', '4'],
				['The Joneses', '', '']
			],
			[...mapping]
		);

		expect(candidates).toHaveLength(2);
		expect(candidates[0]).toMatchObject({ name: 'The Smiths', email: 'a@example.com', partySize: 4 });
		// An absent party size means one, not zero.
		expect(candidates[1]).toMatchObject({ email: null, partySize: 1 });
	});

	it('refuses to import without a name column', () => {
		const result = mapRows([['a@example.com']], ['email']);
		expect(result.candidates).toHaveLength(0);
		expect(result.problems[0].message).toMatch(/household name/i);
	});

	it('reports a nameless row rather than dropping it silently', () => {
		const { candidates, problems } = mapRows([['', 'a@example.com', '2']], [...mapping]);

		expect(candidates).toHaveLength(0);
		expect(problems[0]).toMatchObject({ line: 2, message: 'No household name in this row.' });
	});

	it('skips a wholly blank row without complaining', () => {
		const { candidates, problems } = mapRows([['', '', '']], [...mapping]);
		expect(candidates).toHaveLength(0);
		expect(problems).toHaveLength(0);
	});

	it('imports a household whose email is invalid, and says so', () => {
		const { candidates, problems } = mapRows([['The Smiths', 'not-an-email', '2']], [...mapping]);

		expect(candidates[0]).toMatchObject({ name: 'The Smiths', email: null });
		expect(problems[0].message).toMatch(/not a valid email/i);
	});

	it('falls back to a party size of one and flags the bad value', () => {
		const { candidates, problems } = mapRows([['The Smiths', '', 'lots']], [...mapping]);

		expect(candidates[0].partySize).toBe(1);
		expect(problems[0].message).toMatch(/not a valid party size/i);
	});

	it('spots duplicates inside the file, case-insensitively', () => {
		const { duplicatesInFile } = mapRows(
			[
				['The Smiths', '', ''],
				['the smiths', '', '']
			],
			[...mapping]
		);

		expect(duplicatesInFile).toEqual(['The Smiths']);
	});

	it('numbers problems by their line in the source file', () => {
		const { problems } = mapRows(
			[
				['The Smiths', '', ''],
				['', '', '']
			],
			[...mapping]
		);
		// Row index 1 is line 3: one for the header, one for zero-indexing.
		expect(problems).toHaveLength(0);
	});
});

describe('csv export', () => {
	it('quotes only what needs quoting', () => {
		expect(csvField('plain')).toBe('plain');
		expect(csvField('has,comma')).toBe('"has,comma"');
		expect(csvField('has "quotes"')).toBe('"has ""quotes"""');
		expect(csvField(null)).toBe('');
		expect(csvField(4)).toBe('4');
	});

	it('defuses spreadsheet formula injection', () => {
		// Excel would otherwise execute this the moment the export was opened.
		expect(csvField('=1+1')).toBe("'=1+1");
		expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
		expect(csvField('-2+3')).toBe("'-2+3");
		expect(csvField('+1')).toBe("'+1");
	});

	it('writes CRLF rows, which is what Excel expects', () => {
		expect(toCsv(['A', 'B'], [[1, 2]])).toBe('A,B\r\n1,2\r\n');
	});

	it('round-trips through the parser', () => {
		const csv = toCsv(
			['Household name', 'Email'],
			[
				['Smith, John & "Jane"', 'a@example.com'],
				['Multi\nline', '']
			]
		);

		const parsed = parseCsv(csv);
		expect(parsed.headers).toEqual(['Household name', 'Email']);
		expect(parsed.rows[0][0]).toBe('Smith, John & "Jane"');
		expect(parsed.rows[1][0]).toBe('Multi\nline');
	});
});
