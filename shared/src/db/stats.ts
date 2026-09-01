/**
 * Dashboard and analytics aggregates.
 *
 * All of it is computed in SQL rather than by pulling rows into JavaScript and
 * reducing, so the numbers stay right as the list grows and each screen is one query
 * rather than one query plus a loop.
 */
import type { DashboardStats, ResponsePoint } from '../types';
import { getDb } from './connection';
import { countRsvpsBetween } from './rsvps';
import { listReminderBatches } from './activity';

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
	const rows = getDb()
		.prepare(
			`SELECT substr(submitted_at, 1, 10) AS date,
				COUNT(*) AS responses,
				SUM(CASE WHEN attending = 1 THEN 1 ELSE 0 END) AS attending,
				SUM(CASE WHEN attending = 0 THEN 1 ELSE 0 END) AS declined
			 FROM rsvps
			 GROUP BY date
			 ORDER BY date`
		)
		.all() as { date: string; responses: number; attending: number; declined: number }[];

	if (rows.length === 0) return [];

	const byDate = new Map(rows.map((row) => [row.date, row]));
	const points: ResponsePoint[] = [];
	let cumulative = 0;

	const start = new Date(`${rows[0].date}T00:00:00Z`);
	const end = new Date(`${rows[rows.length - 1].date}T00:00:00Z`);

	for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
		const key = day.toISOString().slice(0, 10);
		const row = byDate.get(key);
		cumulative += row?.responses ?? 0;
		points.push({
			date: key,
			responses: row?.responses ?? 0,
			cumulative,
			attending: row?.attending ?? 0,
			declined: row?.declined ?? 0
		});
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
	const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
	const rows = getDb()
		.prepare(
			`SELECT substr(submitted_at, 1, 10) AS date, COUNT(*) AS responses
			 FROM rsvps WHERE substr(submitted_at, 1, 10) >= ?
			 GROUP BY date ORDER BY date`
		)
		.all(since) as { date: string; responses: number }[];

	const byDate = new Map(rows.map((row) => [row.date, row.responses]));
	const out: { date: string; responses: number }[] = [];

	for (let index = days - 1; index >= 0; index -= 1) {
		const key = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
		out.push({ date: key, responses: byDate.get(key) ?? 0 });
	}
	return out;
}
