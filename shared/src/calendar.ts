/**
 * The .ics file offered on the RSVP confirmation.
 *
 * Written by hand rather than pulled from a library: the format is a handful of lines,
 * and the only genuinely fiddly parts -- CRLF endings, escaping, and the 75-octet line
 * fold -- are the parts a library would hide while still getting blamed when a calendar
 * refuses the file.
 */

/** RFC 5545 escaping: commas, semicolons and backslashes are structural. */
function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/**
 * Folds a line to 75 octets, as the spec requires.
 *
 * Measured in bytes, not characters: an address with an accented letter is two octets,
 * and folding on character count would produce lines that are still too long.
 */
function fold(line: string): string {
	const encoder = new TextEncoder();
	if (encoder.encode(line).length <= 75) return line;

	const parts: string[] = [];
	let current = '';
	let bytes = 0;

	for (const char of line) {
		const size = encoder.encode(char).length;
		// 74 leaves room for the leading space that marks a continuation line.
		if (bytes + size > 74) {
			parts.push(current);
			current = '';
			bytes = 0;
		}
		current += char;
		bytes += size;
	}
	if (current) parts.push(current);

	return parts.join('\r\n ');
}

/** Local wall-clock stamp: 20270529T160000. No Z -- see `buildIcs`. */
function stamp(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return (
		`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
		`T${pad(date.getHours())}${pad(date.getMinutes())}00`
	);
}

function utcStamp(date: Date): string {
	return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

export interface CalendarEvent {
	/** Stable across regenerations, so re-adding updates rather than duplicates. */
	uid: string;
	title: string;
	description: string;
	location: string;
	start: Date;
	/** Defaults to six hours after the start -- a wedding is not a 30-minute meeting. */
	end?: Date;
	url?: string;
}

/**
 * Builds the calendar file.
 *
 * The event is written as a *floating* local time, with no timezone and no VTIMEZONE
 * block. That is deliberate: a wedding starts at four in the afternoon where it is
 * being held, and a guest flying in should see 4pm, not 4pm converted into whatever
 * zone their phone happened to be in when they tapped the button.
 */
export function buildIcs(event: CalendarEvent): string {
	const end = event.end ?? new Date(event.start.getTime() + 6 * 3600 * 1000);

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//wedding-rsvp//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${escapeText(event.uid)}`,
		`DTSTAMP:${utcStamp(new Date())}`,
		`DTSTART:${stamp(event.start)}`,
		`DTEND:${stamp(end)}`,
		`SUMMARY:${escapeText(event.title)}`,
		`DESCRIPTION:${escapeText(event.description)}`,
		`LOCATION:${escapeText(event.location)}`,
		...(event.url ? [`URL:${escapeText(event.url)}`] : []),
		'STATUS:CONFIRMED',
		'TRANSP:OPAQUE',
		// A day's warning, then an hour's. Enough to be useful, not enough to nag.
		'BEGIN:VALARM',
		'TRIGGER:-P1D',
		'ACTION:DISPLAY',
		`DESCRIPTION:${escapeText(event.title)} is tomorrow`,
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR'
	];

	// CRLF is required by the spec, and some clients genuinely reject bare LF.
	return `${lines.map(fold).join('\r\n')}\r\n`;
}
