import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropDatabase, freshDatabase, makeHousehold } from './helpers';
import {
	SAMPLE_CONTEXT,
	contextForHousehold,
	htmlToText,
	renderSubject,
	renderTemplate,
	wrapEmailHtml,
	type MergeContext
} from '$shared/email-template';
import { sanitizeHtml } from '$shared/sanitize';
import { detectImageType } from '$shared/db/images';
import { defaultSiteContent } from '$shared/defaults';
import { themeCss } from '$shared/theme';
import type { InvitationContent, ThemeContent } from '$shared/types';
import {
	countdownTo,
	dateLineMatches,
	formatLongDate,
	formatRelative,
	formatShortDate,
	localDayKey,
	monogram,
	pad2,
	percent,
	pluralise
} from '$shared/format';

const context: MergeContext = {
	householdName: 'The Smiths',
	rsvpLink: 'https://rsvp.example.com/rsvp/abc?x=1&y=2',
	weddingDate: 'Saturday, May 29, 2027',
	venue: 'The Old Barn',
	deadline: 'April 29, 2027',
	coupleNames: 'Andrew & Madeline'
};

beforeEach(freshDatabase);
afterEach(dropDatabase);

describe('merge fields', () => {
	it('substitutes every known field', () => {
		const rendered = renderTemplate(
			'<p>Hi {{household_name}}, join {{couple_names}} at {{venue}} on {{wedding_date}} -- reply by {{deadline}}.</p>',
			context
		);

		expect(rendered).toContain('The Smiths');
		expect(rendered).toContain('The Old Barn');
		expect(rendered).toContain('April 29, 2027');
		// The ampersand in the couple's names is escaped for HTML.
		expect(rendered).toContain('Andrew &amp; Madeline');
	});

	it('tolerates whitespace and case inside the braces', () => {
		expect(renderTemplate('{{ HOUSEHOLD_NAME }}', context)).toBe('The Smiths');
	});

	it('leaves an unknown field untouched so the typo is visible in the preview', () => {
		expect(renderTemplate('{{not_a_field}}', context)).toBe('{{not_a_field}}');
	});

	it('does not escape the RSVP link, which would break its query string', () => {
		const rendered = renderTemplate('<a href="{{rsvp_link}}">RSVP</a>', context);
		expect(rendered).toContain('href="https://rsvp.example.com/rsvp/abc?x=1&y=2"');
	});

	it('escapes a household name containing markup', () => {
		const rendered = renderTemplate('{{household_name}}', {
			...context,
			householdName: '<script>alert(1)</script>'
		});
		expect(rendered).not.toContain('<script>');
		expect(rendered).toContain('&lt;script&gt;');
	});

	it('leaves the subject line unescaped, since it is plain text', () => {
		expect(renderSubject('A note for {{couple_names}}', context)).toBe(
			'A note for Andrew & Madeline'
		);
	});

	it('builds a context from a household, with its own link', () => {
		const household = makeHousehold({ name: 'The Joneses' });
		const built = contextForHousehold(household, {
			siteUrl: 'https://rsvp.example.com',
			weddingDate: 'A date',
			venue: 'A venue',
			deadline: 'A deadline',
			coupleNames: 'A & M'
		});

		expect(built.householdName).toBe('The Joneses');
		expect(built.rsvpLink).toBe(`https://rsvp.example.com/rsvp/${household.token}`);
	});

	it('survives a template body that was sanitised first', () => {
		// This is the real pipeline: sanitise, then substitute.
		const body = sanitizeHtml('<p onclick="x">Hi {{household_name}}</p><script>bad()</script>');
		const rendered = renderTemplate(body, context);

		expect(rendered).toBe('<p>Hi The Smiths</p>');
	});

	it('has a sample context for the editor preview', () => {
		expect(renderTemplate('{{household_name}}', SAMPLE_CONTEXT)).toBe('The Whitfield Family');
	});
});

describe('email document', () => {
	it('wraps a body in a complete HTML document', () => {
		const html = wrapEmailHtml('<p>Hi</p>', 'Andrew & Madeline');

		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('<p>Hi</p>');
		expect(html).toContain('Andrew &amp; Madeline');
	});

	it('derives a readable plain-text alternative', () => {
		const text = htmlToText(
			'<p>Hi there</p><p>Please <a href="https://example.com/x">RSVP here</a>.</p><ul><li>One</li><li>Two</li></ul>'
		);

		expect(text).toContain('Hi there');
		// Links keep their destination, since a text reader cannot click one.
		expect(text).toContain('RSVP here (https://example.com/x)');
		expect(text).toContain('- One');
		expect(text).not.toContain('<');
	});

	it('unescapes entities on the way to text', () => {
		expect(htmlToText('<p>Andrew &amp; Madeline</p>')).toBe('Andrew & Madeline');
	});
});

describe('image type detection', () => {
	const bytesOf = (...values: number[]) => new Uint8Array([...values, ...Array(16).fill(0)]);

	it('recognises the formats a browser will render', () => {
		expect(detectImageType(bytesOf(0xff, 0xd8, 0xff))).toBe('image/jpeg');
		expect(detectImageType(bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
		expect(detectImageType(bytesOf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif');

		const webp = new Uint8Array(16);
		webp.set(new TextEncoder().encode('RIFF'), 0);
		webp.set(new TextEncoder().encode('WEBP'), 8);
		expect(detectImageType(webp)).toBe('image/webp');
	});

	it('rejects a file that merely claims to be an image', () => {
		// An HTML file uploaded as "photo.png" -- the reason the check exists.
		expect(detectImageType(new TextEncoder().encode('<html><body>hi</body></html>'))).toBeNull();
		expect(detectImageType(new Uint8Array([1, 2, 3]))).toBeNull();
		expect(detectImageType(new Uint8Array())).toBeNull();
	});
});

describe('the site theme', () => {
	const theme = (overrides: Partial<ThemeContent> = {}): ThemeContent => ({
		...defaultSiteContent().theme,
		...overrides
	});

	it('emits nothing at all for a site nobody has themed', () => {
		// The stylesheet already ships these values; repeating them would only give the
		// cascade something extra to argue with.
		expect(themeCss(theme())).toBe('');
	});

	it('sets the text colour, and the caption colour with it', () => {
		const css = themeCss(theme({ ink: '#26343F' }));

		expect(css).toContain('--c-ink:38 52 63');
		// Muted follows the ink rather than staying a stray neutral grey.
		expect(css).toMatch(/--c-muted:\d+ \d+ \d+/);
	});

	/**
	 * The couple picks a colour against the light page, which is what the editor shows
	 * them. Reusing it on the dark palette would print near-black on near-black.
	 */
	it('lifts a dark text colour for dark mode, and leaves a light one alone', () => {
		const dark = themeCss(theme({ ink: '#26343F' }));
		const darkBlock = dark.slice(dark.indexOf('prefers-color-scheme:dark'));

		// The dark-mode ink is a lighter version of the same colour, not the same one.
		expect(darkBlock).toContain('--c-ink:');
		expect(darkBlock).not.toContain('--c-ink:38 52 63');

		// Something already pale enough is used as-is.
		const pale = themeCss(theme({ ink: '#EFEAE3' }));
		const paleBlock = pale.slice(pale.indexOf('prefers-color-scheme:dark'));
		expect(paleBlock).toContain('--c-ink:239 234 227');
	});

	it('ignores a colour it cannot read rather than emitting nonsense', () => {
		expect(themeCss(theme({ ink: 'rebeccapurple' }))).toBe('');
		expect(themeCss(theme({ accent: 'not a colour' }))).toBe('');
	});
});

describe('formatting', () => {
	it('formats dates for the site', () => {
		expect(formatLongDate('2027-05-29T12:00:00Z')).toBe('Saturday, May 29, 2027');
		expect(formatShortDate('2027-05-29T12:00:00Z')).toBe('May 29, 2027');
	});

	/**
	 * The wedding date is stored as a bare `YYYY-MM-DD`, and ECMAScript reads that as
	 * UTC midnight while these formatters render in the local zone. West of UTC that
	 * printed the day before -- which is how the site's footer came to disagree with the
	 * Event Details page, whose line is typed by hand.
	 *
	 * The suite pins TZ=UTC, where the bug is invisible, so this one case moves the zone
	 * on purpose. Node re-reads TZ per call, so the restore in `finally` is enough.
	 */
	it('reads a bare date as a calendar day, in any timezone', () => {
		const original = process.env.TZ;
		try {
			for (const zone of ['America/Chicago', 'Pacific/Honolulu', 'Asia/Tokyo']) {
				process.env.TZ = zone;
				expect(formatLongDate('2027-05-29'), zone).toBe('Saturday, May 29, 2027');
				expect(formatShortDate('2027-05-29'), zone).toBe('May 29, 2027');
			}
		} finally {
			process.env.TZ = original;
		}
	});

	it('falls back rather than printing "Invalid Date"', () => {
		expect(formatLongDate('not a date', 'TBC')).toBe('TBC');
		expect(formatLongDate(null, '')).toBe('');
		expect(formatShortDate(undefined, '--')).toBe('--');
	});

	it('describes times relative to now', () => {
		const now = new Date('2027-05-29T12:00:00Z');
		expect(formatRelative(new Date('2027-05-29T11:59:50Z'), now)).toContain('now');
		expect(formatRelative(new Date('2027-05-28T12:00:00Z'), now)).toBe('yesterday');
		expect(formatRelative(new Date('2027-05-22T12:00:00Z'), now)).toBe('last week');
		expect(formatRelative(null)).toBe('');
	});

	it('breaks a countdown into whole units', () => {
		const now = new Date('2027-05-27T10:30:15Z');
		const target = new Date('2027-05-29T12:45:30Z');

		expect(countdownTo(target, now)).toMatchObject({
			days: 2,
			hours: 2,
			minutes: 15,
			seconds: 15,
			past: false
		});
	});

	it('reports a past target rather than counting up', () => {
		const result = countdownTo(new Date('2020-01-01'), new Date('2027-01-01'));
		expect(result).toMatchObject({ past: true, days: 0, totalMs: 0 });
	});

	it('treats an unparseable target as past rather than rendering NaN', () => {
		expect(countdownTo(new Date('nonsense')).past).toBe(true);
	});

	it('pads, pluralises and percents', () => {
		expect(pad2(7)).toBe('07');
		expect(pad2(-1)).toBe('00');
		expect(pad2(123)).toBe('123');

		expect(pluralise(1, 'day')).toBe('1 day');
		expect(pluralise(2, 'day')).toBe('2 days');
		expect(pluralise(2, 'person', 'people')).toBe('2 people');

		expect(percent(1, 4)).toBe(25);
		// Guarded, so an empty guest list reads 0% rather than NaN%.
		expect(percent(1, 0)).toBe(0);
	});

	/**
	 * The counterpart to the bare-date case above, in the other direction: naming the
	 * day an instant fell on. `toISOString().slice(0, 10)` answers the UTC day, which
	 * is how an evening RSVP came to be counted on the next day's bar in the charts.
	 */
	describe('localDayKey', () => {
		it('names the local day, not the UTC one', () => {
			const original = process.env.TZ;
			try {
				// 02:30 UTC on the 30th is still the evening of the 29th in Chicago.
				const evening = new Date('2027-05-30T02:30:00Z');

				process.env.TZ = 'America/Chicago';
				expect(localDayKey(evening)).toBe('2027-05-29');

				// ...and already the morning of the 30th in Tokyo.
				process.env.TZ = 'Asia/Tokyo';
				expect(localDayKey(evening)).toBe('2027-05-30');
			} finally {
				process.env.TZ = original;
			}
		});

		it('pads a single-digit month and day', () => {
			expect(localDayKey(new Date(2027, 0, 5))).toBe('2027-01-05');
		});

		it('answers empty rather than "Invalid Date" for nothing usable', () => {
			expect(localDayKey(null)).toBe('');
			expect(localDayKey('not a date')).toBe('');
		});
	});

	describe('the wordmark monogram', () => {
		it('takes the initial of each name', () => {
			expect(monogram('Andrew & Madeline')).toBe('A & M');
			expect(monogram('Andrew and Madeline')).toBe('A & M');
			expect(monogram('andrew & madeline')).toBe('A & M');
		});

		/**
		 * The separator used to be matched as a bare `and`, which also matched the one
		 * inside "Andrew" -- splitting the names into "", "rew" and "Madeline", and
		 * putting "R & M" in the corner of every page on the site.
		 */
		it('does not split on "and" inside a name', () => {
			expect(monogram('Andrew & Madeline')).not.toBe('R & M');
			expect(monogram('Amanda & Sandy')).toBe('A & S');
			expect(monogram('Alexander & Cassandra')).toBe('A & C');
		});

		it('copes with one name and with none', () => {
			expect(monogram('Madeline')).toBe('M');
			expect(monogram('')).toBe('Wedding');
			expect(monogram('   ')).toBe('Wedding');
		});
	});

	describe('dateLineMatches', () => {
		it('accepts a line that names the same day, however it is written', () => {
			for (const line of [
				'Saturday, May 29, 2027',
				'May 29th, 2027',
				'the 29th of May, 2027',
				'Sat 29 May 2027',
				'5/29/2027'
			]) {
				expect(dateLineMatches(line, '2027-05-29'), line).toBe(true);
			}
		});

		it('spots a line left behind when the date moved', () => {
			expect(dateLineMatches('Saturday, May 29, 2027', '2027-06-12')).toBe(false);
			expect(dateLineMatches('Saturday, May 29, 2026', '2027-05-29')).toBe(false);
			expect(dateLineMatches('Saturday, May 22, 2027', '2027-05-29')).toBe(false);
		});

		it('stays quiet when there is nothing to compare', () => {
			expect(dateLineMatches('', '2027-05-29')).toBe(true);
			expect(dateLineMatches('Saturday, May 29, 2027', '')).toBe(true);
			expect(dateLineMatches('Saturday, May 29, 2027', 'not a date')).toBe(true);
		});
	});
});

describe('invitation wording inheritance', () => {
	/**
	 * "The venue" could otherwise live in three places -- Settings, Event Details and the
	 * invitation -- with no rule about which wins. The rule is that the invitation starts
	 * from the other two and keeps whatever is deliberately written on it.
	 */
	function fill(stored: Partial<InvitationContent>, facts: { venue: string; details: string }) {
		const base = defaultSiteContent().invitation;
		const merged = { ...base, ...stored };
		const pick = (value: string, ...rest: string[]) =>
			value.trim() || rest.find((candidate) => candidate.trim()) || '';

		return { ...merged, venueName: pick(merged.venueName, facts.venue, facts.details) };
	}

	it('takes the venue from settings when the invitation has none', () => {
		expect(fill({ venueName: '' }, { venue: 'The Old Barn', details: 'Ignored' }).venueName).toBe(
			'The Old Barn'
		);
	});

	it('falls back to the details page when settings are blank', () => {
		expect(fill({ venueName: '' }, { venue: '', details: 'From details' }).venueName).toBe(
			'From details'
		);
	});

	it('keeps what was deliberately written on the card', () => {
		// An invitation says things a website does not; once written it must stick.
		expect(
			fill({ venueName: 'The Barn at Willow Creek' }, { venue: 'The Old Barn', details: 'x' })
				.venueName
		).toBe('The Barn at Willow Creek');
	});
});
