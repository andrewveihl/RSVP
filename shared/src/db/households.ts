/**
 * Household reads and writes.
 *
 * Every statement below is prepared with bound parameters. Where a query needs a
 * variable number of ids, the placeholders are generated from the array's *length*
 * and the values are still bound -- no user input is ever concatenated into SQL.
 */
import type { Household, HouseholdWithRsvp, Rsvp, RsvpStatus } from '../types';
import { getDb, nowIso } from './connection';
import { generateToken, newId } from '../tokens';
import { rowToRsvp, type RsvpRow } from './rsvps';

export interface HouseholdRow {
	id: string;
	name: string;
	token: string;
	email: string | null;
	phone: string | null;
	mailing_address: string | null;
	party_size: number;
	max_extra_guests: number | null;
	batch: string | null;
	side: string | null;
	notes: string | null;
	invitation_sent: number;
	invitation_sent_at: string | null;
	created_at: string;
	updated_at: string;
}

export function rowToHousehold(row: HouseholdRow): Household {
	return {
		id: row.id,
		name: row.name,
		token: row.token,
		email: row.email,
		phone: row.phone,
		mailingAddress: row.mailing_address,
		partySize: row.party_size,
		// A row written before migration 003 has no column value at all, so `undefined`
		// is normalised to null here -- "no cap", which is how it behaved before.
		maxExtraGuests: row.max_extra_guests ?? null,
		batch: row.batch,
		side: row.side,
		notes: row.notes,
		invitationSent: row.invitation_sent === 1,
		invitationSentAt: row.invitation_sent_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

/** The status and head count a household contributes, derived from its RSVP. */
export function deriveStatus(rsvp: Rsvp | null): { status: RsvpStatus; attendingTotal: number } {
	if (!rsvp) return { status: 'pending', attendingTotal: 0 };
	if (!rsvp.attending) return { status: 'declined', attendingTotal: 0 };
	return { status: 'attending', attendingTotal: rsvp.guestCount + rsvp.plusOneCount };
}

function joinRsvp(household: Household, rsvp: Rsvp | null): HouseholdWithRsvp {
	return { ...household, rsvp, ...deriveStatus(rsvp) };
}

export interface NewHousehold {
	name: string;
	email?: string | null;
	phone?: string | null;
	mailingAddress?: string | null;
	partySize?: number;
	/** Extra guests allowed beyond `partySize`; null or omitted means no cap. */
	maxExtraGuests?: number | null;
	batch?: string | null;
	side?: string | null;
	notes?: string | null;
	/** Supplied only by the CSV importer when re-importing a previous export. */
	token?: string;
}

export function createHousehold(input: NewHousehold): Household {
	const db = getDb();
	const timestamp = nowIso();
	const row: HouseholdRow = {
		id: newId(),
		name: input.name,
		token: input.token ?? generateToken(),
		email: input.email ?? null,
		phone: input.phone ?? null,
		mailing_address: input.mailingAddress ?? null,
		party_size: input.partySize ?? 1,
		max_extra_guests: input.maxExtraGuests ?? null,
		batch: input.batch ?? null,
		side: input.side ?? null,
		notes: input.notes ?? null,
		invitation_sent: 0,
		invitation_sent_at: null,
		created_at: timestamp,
		updated_at: timestamp
	};

	db.prepare(
		`INSERT INTO households
			(id, name, token, email, phone, mailing_address, party_size, max_extra_guests,
			 batch, side, notes, invitation_sent, invitation_sent_at, created_at, updated_at)
		 VALUES
			(@id, @name, @token, @email, @phone, @mailing_address, @party_size, @max_extra_guests,
			 @batch, @side, @notes, @invitation_sent, @invitation_sent_at, @created_at, @updated_at)`
	).run(row);

	return rowToHousehold(row);
}

export function getHousehold(id: string): Household | null {
	const row = getDb().prepare('SELECT * FROM households WHERE id = ?').get(id) as HouseholdRow | undefined;
	return row ? rowToHousehold(row) : null;
}

export function getHouseholdByToken(token: string): Household | null {
	const row = getDb()
		.prepare('SELECT * FROM households WHERE token = ?')
		.get(token) as HouseholdRow | undefined;
	return row ? rowToHousehold(row) : null;
}

/**
 * Case-insensitive exact name match, used by the CSV importer to spot duplicates.
 *
 * SQLite's `LOWER` is ASCII-only, which is fine for the names on a guest list and
 * avoids depending on an ICU build being present in the container.
 */
export function findHouseholdByName(name: string): Household | null {
	const row = getDb()
		.prepare('SELECT * FROM households WHERE LOWER(name) = LOWER(?) LIMIT 1')
		.get(name) as HouseholdRow | undefined;
	return row ? rowToHousehold(row) : null;
}

export interface HouseholdUpdate {
	name?: string;
	email?: string | null;
	phone?: string | null;
	mailingAddress?: string | null;
	partySize?: number;
	maxExtraGuests?: number | null;
	batch?: string | null;
	side?: string | null;
	notes?: string | null;
}

const UPDATABLE: Record<keyof HouseholdUpdate, string> = {
	name: 'name',
	email: 'email',
	phone: 'phone',
	mailingAddress: 'mailing_address',
	partySize: 'party_size',
	maxExtraGuests: 'max_extra_guests',
	batch: 'batch',
	side: 'side',
	notes: 'notes'
};

/** Partial update: only the keys actually present are written. */
export function updateHousehold(id: string, patch: HouseholdUpdate): Household | null {
	const entries = (Object.keys(patch) as (keyof HouseholdUpdate)[])
		.filter((key) => patch[key] !== undefined && key in UPDATABLE)
		.map((key) => [UPDATABLE[key], patch[key]] as const);

	if (entries.length === 0) return getHousehold(id);

	// Column names come from the UPDATABLE map, never from the caller's object keys,
	// so this template can never be steered by request data.
	const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
	const values = entries.map(([, value]) => value as string | number | null);

	getDb()
		.prepare(`UPDATE households SET ${assignments}, updated_at = ? WHERE id = ?`)
		.run(...values, nowIso(), id);

	return getHousehold(id);
}

export function deleteHousehold(id: string): boolean {
	// The RSVP and email rows go with it via ON DELETE CASCADE; activity entries keep
	// their history but drop the household reference (ON DELETE SET NULL).
	return getDb().prepare('DELETE FROM households WHERE id = ?').run(id).changes > 0;
}

/** Rotates a household's token, invalidating any link already handed out. */
export function regenerateToken(id: string): string | null {
	const token = generateToken();
	const result = getDb()
		.prepare('UPDATE households SET token = ?, updated_at = ? WHERE id = ?')
		.run(token, nowIso(), id);
	return result.changes > 0 ? token : null;
}

export function markInvitationSent(ids: string[], sent: boolean): number {
	if (ids.length === 0) return 0;
	const db = getDb();
	const placeholders = ids.map(() => '?').join(', ');
	const timestamp = sent ? nowIso() : null;

	return db
		.prepare(
			`UPDATE households
			 SET invitation_sent = ?, invitation_sent_at = ?, updated_at = ?
			 WHERE id IN (${placeholders})`
		)
		.run(sent ? 1 : 0, timestamp, nowIso(), ...ids).changes;
}

export function deleteHouseholds(ids: string[]): number {
	if (ids.length === 0) return 0;
	const placeholders = ids.map(() => '?').join(', ');
	return getDb().prepare(`DELETE FROM households WHERE id IN (${placeholders})`).run(...ids).changes;
}

// --- Listing ----------------------------------------------------------------

type JoinedRow = HouseholdRow & {
	[K in keyof RsvpRow as `r_${K & string}`]: RsvpRow[K] | null;
};

const LIST_SELECT = `
	SELECT h.*,
		r.id AS r_id, r.household_id AS r_household_id, r.attending AS r_attending,
		r.guest_count AS r_guest_count, r.plus_one_count AS r_plus_one_count,
		r.submitted_at AS r_submitted_at, r.updated_at AS r_updated_at,
		r.ip_address AS r_ip_address, r.user_agent AS r_user_agent
	FROM households h
	LEFT JOIN rsvps r ON r.household_id = h.id
`;

function joinedRowToHousehold(row: JoinedRow): HouseholdWithRsvp {
	const household = rowToHousehold(row);
	if (row.r_id === null || row.r_id === undefined) return joinRsvp(household, null);

	const rsvp = rowToRsvp({
		id: row.r_id as string,
		household_id: row.r_household_id as string,
		attending: row.r_attending as number,
		guest_count: row.r_guest_count as number,
		plus_one_count: row.r_plus_one_count as number,
		submitted_at: row.r_submitted_at as string,
		updated_at: row.r_updated_at as string,
		ip_address: row.r_ip_address as string | null,
		user_agent: row.r_user_agent as string | null
	});
	return joinRsvp(household, rsvp);
}

export type HouseholdSort =
	| 'name'
	| 'email'
	| 'party_size'
	| 'status'
	| 'plus_ones'
	| 'invitation_sent'
	| 'updated_at';

export interface ListOptions {
	search?: string;
	status?: RsvpStatus | 'all';
	invitationSent?: boolean | 'all';
	batch?: string;
	side?: string;
	sort?: HouseholdSort;
	direction?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
}

/**
 * Sort keys are mapped to SQL fragments through this table rather than interpolated.
 *
 * A query-string `?sort=` value can therefore only ever select one of these, which is
 * what keeps a dynamic ORDER BY from becoming an injection point.
 */
const SORT_SQL: Record<HouseholdSort, string> = {
	name: 'h.name COLLATE NOCASE',
	email: 'h.email COLLATE NOCASE',
	party_size: 'h.party_size',
	// 0/1/2 rather than alphabetical, so the order reads attending -> declined -> pending.
	status: 'CASE WHEN r.id IS NULL THEN 2 WHEN r.attending = 1 THEN 0 ELSE 1 END',
	plus_ones: 'COALESCE(r.plus_one_count, 0)',
	invitation_sent: 'h.invitation_sent',
	updated_at: 'h.updated_at'
};

interface WhereClause {
	sql: string;
	params: (string | number)[];
}

function buildWhere(options: ListOptions): WhereClause {
	const clauses: string[] = [];
	const params: (string | number)[] = [];

	const search = options.search?.trim();
	if (search) {
		clauses.push(
			"(h.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR h.email LIKE ? ESCAPE '\\' COLLATE NOCASE)"
		);
		// LIKE wildcards inside the search text would otherwise widen the query;
		// escaping them keeps a search for "100%" from matching every row.
		const pattern = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
		params.push(pattern, pattern);
	}

	if (options.status && options.status !== 'all') {
		if (options.status === 'pending') clauses.push('r.id IS NULL');
		else if (options.status === 'attending') clauses.push('r.id IS NOT NULL AND r.attending = 1');
		else clauses.push('r.id IS NOT NULL AND r.attending = 0');
	}

	if (options.invitationSent === true) clauses.push('h.invitation_sent = 1');
	if (options.invitationSent === false) clauses.push('h.invitation_sent = 0');

	if (options.batch) {
		clauses.push('h.batch = ?');
		params.push(options.batch);
	}

	if (options.side) {
		clauses.push('h.side = ?');
		params.push(options.side);
	}

	return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function listHouseholds(options: ListOptions = {}): HouseholdWithRsvp[] {
	const where = buildWhere(options);
	const sort = SORT_SQL[options.sort ?? 'name'] ?? SORT_SQL.name;
	const direction = options.direction === 'desc' ? 'DESC' : 'ASC';

	const limit = options.limit ?? -1; // SQLite reads -1 as "no limit".
	const offset = options.offset ?? 0;

	const rows = getDb()
		.prepare(
			`${LIST_SELECT} ${where.sql}
			 ORDER BY ${sort} ${direction}, h.name COLLATE NOCASE ASC
			 LIMIT ? OFFSET ?`
		)
		.all(...where.params, limit, offset) as JoinedRow[];

	return rows.map(joinedRowToHousehold);
}

export function countHouseholds(options: ListOptions = {}): number {
	const where = buildWhere(options);
	const row = getDb()
		.prepare(
			`SELECT COUNT(*) AS n FROM households h LEFT JOIN rsvps r ON r.household_id = h.id ${where.sql}`
		)
		.get(...where.params) as { n: number };
	return row.n;
}

export function getHouseholdWithRsvp(id: string): HouseholdWithRsvp | null {
	const row = getDb().prepare(`${LIST_SELECT} WHERE h.id = ?`).get(id) as JoinedRow | undefined;
	return row ? joinedRowToHousehold(row) : null;
}

export function getHouseholdWithRsvpByToken(token: string): HouseholdWithRsvp | null {
	const row = getDb().prepare(`${LIST_SELECT} WHERE h.token = ?`).get(token) as JoinedRow | undefined;
	return row ? joinedRowToHousehold(row) : null;
}

/** Every distinct batch label in use, for the analytics breakdown and filters. */
export function listBatches(): string[] {
	const rows = getDb()
		.prepare("SELECT DISTINCT batch FROM households WHERE batch IS NOT NULL AND batch <> '' ORDER BY batch")
		.all() as { batch: string }[];
	return rows.map((row) => row.batch);
}

/** Every distinct side in use. Free-form, so this is whatever has been typed. */
export function listSides(): string[] {
	const rows = getDb()
		.prepare("SELECT DISTINCT side FROM households WHERE side IS NOT NULL AND side <> '' ORDER BY side")
		.all() as { side: string }[];
	return rows.map((row) => row.side);
}

/**
 * The guest-facing name search behind the "I lost my link" page.
 *
 * It returns whole households, but the caller only ever reveals the name and hands
 * back a redirect -- the token itself is never rendered into the results list.
 */
export function searchHouseholdsByName(query: string, limit = 8): Household[] {
	const trimmed = query.trim();
	if (trimmed.length < 2) return [];

	const pattern = `%${trimmed.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
	const rows = getDb()
		.prepare(
			`SELECT * FROM households
			 WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE
			 ORDER BY name COLLATE NOCASE LIMIT ?`
		)
		.all(pattern, limit) as HouseholdRow[];

	return rows.map(rowToHousehold);
}

/** Households that still owe us an answer, which is who reminders go to. */
export function listPendingHouseholds(): HouseholdWithRsvp[] {
	return listHouseholds({ status: 'pending' });
}

export function getHouseholdsByIds(ids: string[]): HouseholdWithRsvp[] {
	if (ids.length === 0) return [];
	const placeholders = ids.map(() => '?').join(', ');
	const rows = getDb()
		.prepare(`${LIST_SELECT} WHERE h.id IN (${placeholders}) ORDER BY h.name COLLATE NOCASE`)
		.all(...ids) as JoinedRow[];
	return rows.map(joinedRowToHousehold);
}
