/**
 * Dashboard and analytics aggregates.
 *
 * All of it is computed in SQL rather than by pulling rows into JavaScript and
 * reducing, so the numbers stay right as the list grows and each screen is one query
 * rather than one query plus a loop.
 */
import type { DashboardStats, ResponsePoint } from '../types';
import { getDb } from './connection';
import { localDayKey } from '../format';
import { countRsvpsBetween } from './rsvps';
import { listReminderBatches } from './activity';

/**
 * Timestamps are stored as UTC, but every day the site names is a *local* day -- see
 * `localDayKey`. `'localtime'` makes SQLite group them the same way, so a chart and the
 * activity log beside it agree about which day a reply arrived on.
 *
 * With no `TZ` set this is UTC and nothing changes, which is exactly what the unit
 * suite runs under.
 */
const LOCAL_DAY = `strftime('%Y-%m-%d', submitted_at, 'localtime')`;

/** Local midnight on a `YYYY-MM-DD`, for stepping a day at a time. */
function dayFromKey(key: string): Date {
	const [year, month, day] = key.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/** A day key SQLite could actually produce; anything else came from a corrupt row. */
function isDayKey(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getDashboardStats(): DashboardStats {
	const row = getDb()
		.prepare(
			`SELECT
				COUNT(*) AS households,
				COALESCE(SUM(h.party_size), 0) AS invited_guests,
				COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS responded,
				COALESCE(SUM(CASE WHEN r.attending = 1 THEN 1 ELSE 0 END), 0) AS attending_households,
				COALESCE(SUM(CASE WHEN r.attending = 1 THEN r.guest_count + r.plus_one_count ELSE 0 END), 0) AS attending_guests,
				COALESCE(SUM(CASE WHEN r.id IS NOT NULL AND r.attending = 0 THEN 1 ELSE 0 END), 0) AS declined_households,
				COALESCE(SUM(CASE WHEN r.id IS NOT NULL AND r.attending = 0 THEN h.party_size ELSE 0 END), 0) AS declined_guests,
				COALESCE(SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END), 0) AS pending_households,
				COALESCE(SUM(CASE WHEN r.id IS NULL THEN h.party_size ELSE 0 END), 0) AS pending_guests,
				COALESCE(SUM(CASE WHEN r.attending = 1 THEN r.plus_one_count ELSE 0 END), 0) AS plus_ones,
				COALESCE(SUM(h.invitation_sent), 0) AS invitations_sent
			 FROM households h
			 LEFT JOIN rsvps r ON r.household_id = h.id`
		)
		.get() as Record<string, number>;

	const households = row.households ?? 0;

	return {
		households,
		invitedGuests: row.invited_guests ?? 0,
		responded: row.responded ?? 0,
		// Guarded so an empty guest list reads 0%, not NaN%.
		responseRate: households === 0 ? 0 : Math.round((row.responded / households) * 100),
		attendingHouseholds: row.attending_households ?? 0,
		attendingGuests: row.attending_guests ?? 0,
		declinedHouseholds: row.declined_households ?? 0,
		declinedGuests: row.declined_guests ?? 0,
		pendingHouseholds: row.pending_households ?? 0,
		pendingGuests: row.pending_guests ?? 0,
		plusOnes: row.plus_ones ?? 0,
		invitationsSent: row.invitations_sent ?? 0
	};
}

/**
 * Daily response counts with a running total, for the response-rate chart.
 *
 * Days with no replies are filled in rather than skipped, so the line's x-axis is
 * evenly spaced in time instead of compressing a quiet fortnight into one step.
 */
export function responseTimeline(): ResponsePoint[] {
	const rows = (
		getDb()
			.prepare(
				`SELECT ${LOCAL_DAY} AS date,
				COUNT(*) AS responses,
				SUM(CASE WHEN attending = 1 THEN 1 ELSE 0 END) AS attending,
				SUM(CASE WHEN attending = 0 THEN 1 ELSE 0 END) AS declined
			 FROM rsvps
			 GROUP BY date
			 ORDER BY date`
			)
			.all() as { date: string; responses: number; attending: number; declined: number }[]
	)
		// `strftime` answers NULL for a timestamp it cannot parse. Dropping those rows
		// costs one bar; letting one through would end the loop below before it started.
		.filter((row) => isDayKey(row.date));

	if (rows.length === 0) return [];

	const byDate = new Map(rows.map((row) => [row.date, row]));
	const points: ResponsePoint[] = [];
	let cumulative = 0;

	// Stepped a calendar day at a time rather than by 86,400,000ms: adding a fixed
	// number of milliseconds repeats one day and skips another across the two
	// daylight-saving changes a long engagement will cross.
	const cursor = dayFromKey(rows[0].date);
	const end = dayFromKey(rows[rows.length - 1].date);

	// A hand-edited timestamp far in the future would otherwise fill the admin's memory
	// one point at a time. Five years of daily points is far past any real engagement.
	const MAX_POINTS = 2000;

	while (cursor <= end && points.length < MAX_POINTS) {
		const key = localDayKey(cursor);
		const row = byDate.get(key);
		cumulative += row?.responses ?? 0;
		points.push({
			date: key,
			responses: row?.responses ?? 0,
			cumulative,
			attending: row?.attending ?? 0,
			declined: row?.declined ?? 0
		});
		cursor.setDate(cursor.getDate() + 1);
	}

	return points;
}

export interface BatchStats {
	batch: string;
	households: number;
	responded: number;
	attending: number;
	responseRate: number;
}

/** Response rates per invitation batch -- which mailing actually landed. */
export function batchBreakdown(): BatchStats[] {
	const rows = getDb()
		.prepare(
			`SELECT COALESCE(NULLIF(h.batch, ''), 'Unassigned') AS batch,
				COUNT(*) AS households,
				SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS responded,
				SUM(CASE WHEN r.attending = 1 THEN 1 ELSE 0 END) AS attending
			 FROM households h
			 LEFT JOIN rsvps r ON r.household_id = h.id
			 GROUP BY batch
			 ORDER BY batch`
		)
		.all() as { batch: string; households: number; responded: number; attending: number }[];

	return rows.map((row) => ({
		...row,
		responseRate: row.households === 0 ? 0 : Math.round((row.responded / row.households) * 100)
	}));
}

export interface ReminderEffect {
	sentAt: string;
	recipients: number;
	/** Replies received in the 48 hours after the batch went out. */
	responsesWithin48h: number;
}

/**
 * How many RSVPs arrived in the 48 hours after each reminder batch.
 *
 * This is correlation, not proof of causation -- a reply that would have come anyway
 * still lands in the window -- but it is the number that tells the couple whether
 * sending another round is worth it.
 */
export function reminderEffectiveness(limit = 10): ReminderEffect[] {
	return listReminderBatches(limit).map((entry) => {
		const start = entry.createdAt;
		const end = new Date(new Date(entry.createdAt).getTime() + 48 * 3600 * 1000).toISOString();
		const recipients = Number(entry.metadata?.recipients ?? 0);

		return {
			sentAt: entry.createdAt,
			recipients: Number.isFinite(recipients) ? recipients : 0,
			responsesWithin48h: countRsvpsBetween(start, end)
		};
	});
}

/** Replies per day over the recent past, for the activity bar chart. */
export function dailyActivity(days = 30): { date: string; responses: number }[] {
	// Clamped rather than trusted: `NaN` days would otherwise loop zero times and hand
	// the chart an empty axis with no hint as to why.
	const span = Number.isFinite(days) ? Math.max(1, Math.min(366, Math.floor(days))) : 30;

	// Local midnight, `span` days ago. Stepping the date rather than subtracting
	// milliseconds keeps the window exactly that many calendar days wide either side
	// of a daylight-saving change.
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - (span - 1));

	const rows = getDb()
		.prepare(
			`SELECT ${LOCAL_DAY} AS date, COUNT(*) AS responses
			 FROM rsvps WHERE ${LOCAL_DAY} >= ?
			 GROUP BY date ORDER BY date`
		)
		.all(localDayKey(start)) as { date: string; responses: number }[];

	const byDate = new Map(rows.map((row) => [row.date, row.responses]));
	const out: { date: string; responses: number }[] = [];
	const cursor = new Date(start);

	for (let index = 0; index < span; index += 1) {
		const key = localDayKey(cursor);
		out.push({ date: key, responses: byDate.get(key) ?? 0 });
		cursor.setDate(cursor.getDate() + 1);
	}

	return out;
}
