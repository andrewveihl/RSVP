/**
 * Date and number formatting used by both apps.
 *
 * Everything is stored as UTC ISO strings, but a wedding is a local-time event, so
 * these render in the server's zone -- which `TZ` in docker-compose pins to the
 * wedding's. That is deliberate: "May 29" should say May 29 to everyone, not shift by
 * a day for a guest reading it from another continent.
 */

const LONG_DATE: Intl.DateTimeFormatOptions = {
	weekday: 'long',
	year: 'numeric',
	month: 'long',
	day: 'numeric'
};

const SHORT_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

/** A bare `YYYY-MM-DD`: a calendar day, with no time and no zone attached. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a stored value into a Date.
 *
 * Appending `T00:00:00` to a date-only string is the whole point of this function.
 * ECMAScript reads a bare `2027-05-29` as *UTC* midnight, while every formatter below
 * renders in the server's zone -- so anywhere west of UTC the wedding date printed
 * itself as the day before. That is exactly how the site footer came to disagree with
 * the Event Details page, which shows a hand-written line and was therefore right.
 *
 * With the time attached it parses as local midnight, which is what a date typed into
 * a form means and what `weddingDateValue` in config.ts has always done.
 */
function toDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

	const raw = value.trim();
	const date = new Date(DATE_ONLY.test(raw) ? `${raw}T00:00:00` : raw);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLongDate(value: string | Date | null | undefined, fallback = ''): string {
	const date = toDate(value);
	return date ? date.toLocaleDateString('en-US', LONG_DATE) : fallback;
}

export function formatShortDate(value: string | Date | null | undefined, fallback = ''): string {
	const date = toDate(value);
	return date ? date.toLocaleDateString('en-US', SHORT_DATE) : fallback;
}

/**
 * A calendar day as `YYYY-MM-DD`, in the server's zone.
 *
 * `toISOString().slice(0, 10)` is the obvious way to write this and is wrong for the
 * same reason `toDate` above has to append a time: it names the *UTC* day. An RSVP sent
 * at eight in the evening is already tomorrow in UTC anywhere west of it, so grouping
 * replies that way puts them on a day the site never shows -- the activity log beside
 * the chart prints the local time, and the two disagree by one row.
 */
export function localDayKey(value: string | Date | null | undefined): string {
	const date = toDate(value);
	if (!date) return '';

	const pad = (part: number) => String(part).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Whether a hand-written date line still agrees with the stored wedding date.
 *
 * The Event Details page prints prose the couple wrote; the footer, the countdown and
 * the calendar file all read the date from Settings. Nothing forces the two to match,
 * and when they drift the site contradicts itself -- so the admin editor asks this and
 * says something, rather than leaving it to be spotted by a guest.
 *
 * Deliberately loose: "Saturday, May 29, 2027", "May 29th 2027" and "the 29th of May,
 * 2027" all pass. It only wants the month, the day and the year to be present, which
 * is enough to catch the case that matters -- one of them edited and the other not.
 * With nothing to compare against, it answers true rather than nagging.
 */
export function dateLineMatches(
	dateLine: string,
	weddingDate: string | Date | null | undefined
): boolean {
	const line = dateLine.trim().toLowerCase();
	const date = toDate(weddingDate);
	if (!line || !date) return true;

	const month = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
	const shortMonth = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
	const day = date.getDate();
	const year = date.getFullYear();

	const hasMonth =
		line.includes(month) ||
		line.includes(shortMonth) ||
		// A numeric date -- 5/29/2027 or 2027-05-29 -- names its month as digits.
		new RegExp(`(^|[^\\d])0?${date.getMonth() + 1}[/-]`).test(line);
	const hasDay = new RegExp(`(^|[^\\d])0?${day}([^\\d]|$)`).test(line);

	return hasMonth && hasDay && line.includes(String(year));
}

export function formatDateTime(value: string | Date | null | undefined, fallback = ''): string {
	const date = toDate(value);
	if (!date) return fallback;
	return `${date.toLocaleDateString('en-US', SHORT_DATE)}, ${date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit'
	})}`;
}

/** "3 days ago" / "in 2 hours" -- for the activity feed, where exactness is noise. */
export function formatRelative(value: string | Date | null | undefined, now = new Date()): string {
	const date = toDate(value);
	if (!date) return '';

	const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
	const absolute = Math.abs(deltaSeconds);

	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['second', 60],
		['minute', 3600],
		['hour', 86_400],
		['day', 604_800],
		['week', 2_629_800],
		['month', 31_557_600]
	];

	const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

	if (absolute < 45) return formatter.format(0, 'second').replace('now', 'just now');

	let divisor = 1;
	for (const [unit, limit] of units) {
		if (absolute < limit) return formatter.format(Math.round(deltaSeconds / divisor), unit);
		divisor = limit;
	}
	return formatter.format(Math.round(deltaSeconds / 31_557_600), 'year');
}

export interface Countdown {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	/** True once the target has passed -- the site switches to its married copy. */
	past: boolean;
	totalMs: number;
}

/** Breaks the gap to `target` into whole days, hours, minutes and seconds. */
export function countdownTo(target: Date | string, now: Date | number = new Date()): Countdown {
	const end = target instanceof Date ? target : new Date(target);
	const from = typeof now === 'number' ? now : now.getTime();
	const totalMs = end.getTime() - from;

	if (!Number.isFinite(totalMs) || totalMs <= 0) {
		return { days: 0, hours: 0, minutes: 0, seconds: 0, past: true, totalMs: 0 };
	}

	const totalSeconds = Math.floor(totalMs / 1000);
	return {
		days: Math.floor(totalSeconds / 86_400),
		hours: Math.floor((totalSeconds % 86_400) / 3600),
		minutes: Math.floor((totalSeconds % 3600) / 60),
		seconds: totalSeconds % 60,
		past: false,
		totalMs
	};
}

/** Zero-pads to two digits, which is what the flip clock's cards expect. */
export function pad2(value: number): string {
	return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Initials for the site's wordmark: "Andrew & Madeline" becomes "A & M".
 *
 * The separator is matched as `&` or a *space-delimited* "and". Matching a bare `and`
 * anywhere also matches the one inside "**And**rew", which split the couple's own names
 * into "" / "rew" / "Madeline" and put "R & M" in the corner of every page.
 *
 * Lives here rather than in the header component so it can be tested without a browser.
 */
export function monogram(coupleNames: string, fallback = 'Wedding'): string {
	return (
		coupleNames
			.split(/\s*&\s*|\s+and\s+/i)
			// Spread rather than charAt, so a name starting outside the BMP keeps its
			// whole first character instead of half a surrogate pair.
			.map((part) => [...part.trim()][0]?.toUpperCase() ?? '')
			.filter(Boolean)
			.join(' & ') || fallback
	);
}

export function percent(part: number, whole: number): number {
	if (whole <= 0) return 0;
	return Math.round((part / whole) * 100);
}

/**
 * A file size in the largest unit that keeps it readable.
 *
 * Lives here rather than beside the backup code so the Backups page can import it
 * without dragging `node:fs` into the browser bundle.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
