/**
 * RSVP reads and writes.
 *
 * One household has at most one RSVP -- enforced by a unique index, not just by
 * convention -- so `saveRsvp` is an upsert. That is what makes "update my reply"
 * behave: the household's answer is replaced, and the totals stay correct because
 * there is never a second row to double-count.
 */
import type { Rsvp } from '../types';
import { getDb, nowIso } from './connection';
import { newId } from '../tokens';

export interface RsvpRow {
	id: string;
	household_id: string;
	attending: number;
	guest_count: number;
	plus_one_count: number;
	submitted_at: string;
	updated_at: string;
	ip_address: string | null;
	user_agent: string | null;
}

export function rowToRsvp(row: RsvpRow): Rsvp {
	return {
		id: row.id,
		householdId: row.household_id,
		attending: row.attending === 1,
		guestCount: row.guest_count,
		plusOneCount: row.plus_one_count,
		submittedAt: row.submitted_at,
		updatedAt: row.updated_at,
		ipAddress: row.ip_address,
		userAgent: row.user_agent
	};
}

export interface RsvpInput {
	householdId: string;
	attending: boolean;
	guestCount: number;
	plusOneCount: number;
	ipAddress?: string | null;
	userAgent?: string | null;
}

export interface SaveResult {
	rsvp: Rsvp;
	/** False when this replaced an existing reply, which the activity log distinguishes. */
	created: boolean;
}

export function getRsvpForHousehold(householdId: string): Rsvp | null {
	const row = getDb()
		.prepare('SELECT * FROM rsvps WHERE household_id = ?')
		.get(householdId) as RsvpRow | undefined;
	return row ? rowToRsvp(row) : null;
}

/**
 * Inserts or replaces a household's RSVP.
 *
 * A declined reply is stored with zero guests regardless of what the form carried:
 * "not attending, 4 guests" is not a state the head count should ever have to reason
 * about, and the form can send stale numbers when someone toggles yes -> no.
 *
 * `submitted_at` deliberately survives an update -- it is when the household first
 * replied, which is what the response-rate chart and reminder effectiveness measure.
 */
export function saveRsvp(input: RsvpInput): SaveResult {
	const db = getDb();
	const existing = getRsvpForHousehold(input.householdId);
	const timestamp = nowIso();

	const guestCount = input.attending ? Math.max(1, input.guestCount) : 0;
	const plusOneCount = input.attending ? Math.max(0, input.plusOneCount) : 0;

	if (existing) {
		db.prepare(
			`UPDATE rsvps
			 SET attending = ?, guest_count = ?, plus_one_count = ?, updated_at = ?,
			     ip_address = ?, user_agent = ?
			 WHERE household_id = ?`
		).run(
			input.attending ? 1 : 0,
			guestCount,
			plusOneCount,
			timestamp,
			input.ipAddress ?? null,
			input.userAgent ?? null,
			input.householdId
		);

		return { rsvp: getRsvpForHousehold(input.householdId)!, created: false };
	}

	const row: RsvpRow = {
		id: newId(),
		household_id: input.householdId,
		attending: input.attending ? 1 : 0,
		guest_count: guestCount,
		plus_one_count: plusOneCount,
		submitted_at: timestamp,
		updated_at: timestamp,
		ip_address: input.ipAddress ?? null,
		user_agent: input.userAgent ?? null
	};

	db.prepare(
		`INSERT INTO rsvps
			(id, household_id, attending, guest_count, plus_one_count, submitted_at,
			 updated_at, ip_address, user_agent)
		 VALUES
			(@id, @household_id, @attending, @guest_count, @plus_one_count, @submitted_at,
			 @updated_at, @ip_address, @user_agent)`
	).run(row);

	return { rsvp: rowToRsvp(row), created: true };
}

export function deleteRsvp(householdId: string): boolean {
	return getDb().prepare('DELETE FROM rsvps WHERE household_id = ?').run(householdId).changes > 0;
}

/** Every reply, newest first -- the raw feed behind the admin's RSVP screen. */
export function listRsvps(): Rsvp[] {
	const rows = getDb()
		.prepare('SELECT * FROM rsvps ORDER BY submitted_at DESC')
		.all() as RsvpRow[];
	return rows.map(rowToRsvp);
}

/** Replies submitted inside a window, used to score a reminder batch. */
export function countRsvpsBetween(startIso: string, endIso: string): number {
	const row = getDb()
		.prepare('SELECT COUNT(*) AS n FROM rsvps WHERE submitted_at >= ? AND submitted_at < ?')
		.get(startIso, endIso) as { n: number };
	return row.n;
}
