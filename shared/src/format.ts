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

function toDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
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
