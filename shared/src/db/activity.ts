/**
 * The audit log.
 *
 * Writing to it must never be able to fail a request: an RSVP that was accepted and
 * then blew up while logging would leave the guest looking at an error for something
 * that actually worked. So `logActivity` swallows its own errors and reports them to
 * the process log instead.
 */
import type { ActivityEntry, ActivityEventType } from '../types';
import { getDb, nowIso } from './connection';
import { newId } from '../tokens';
import { logError } from '../logger';

interface ActivityRow {
	id: string;
	event_type: string;
	description: string;
	household_id: string | null;
	metadata: string | null;
	ip_address: string | null;
	created_at: string;
}

function rowToEntry(row: ActivityRow): ActivityEntry {
	let metadata: Record<string, unknown> | null = null;
	if (row.metadata) {
		try {
			metadata = JSON.parse(row.metadata) as Record<string, unknown>;
		} catch {
			// A row written by an older version, or hand-edited. Show the log entry
			// anyway; losing the extra context beats hiding the event.
			metadata = null;
		}
	}

	return {
		id: row.id,
		eventType: row.event_type as ActivityEventType,
		description: row.description,
		householdId: row.household_id,
		metadata,
		ipAddress: row.ip_address,
		createdAt: row.created_at
	};
}

export interface ActivityInput {
	eventType: ActivityEventType;
	description: string;
	householdId?: string | null;
	metadata?: Record<string, unknown> | null;
	ipAddress?: string | null;
}

export function logActivity(input: ActivityInput): void {
	try {
		getDb()
			.prepare(
				`INSERT INTO activity_log (id, event_type, description, household_id, metadata, ip_address, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				newId(),
				input.eventType,
				input.description,
				input.householdId ?? null,
				input.metadata ? JSON.stringify(input.metadata) : null,
				input.ipAddress ?? null,
				nowIso()
			);
	} catch (error) {
		logError('Failed to write activity log entry', error, { eventType: input.eventType });
	}
}

export interface ActivityQuery {
	eventType?: ActivityEventType | 'all';
	householdId?: string;
	search?: string;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
}

function buildWhere(query: ActivityQuery): { sql: string; params: (string | number)[] } {
	const clauses: string[] = [];
	const params: (string | number)[] = [];

	if (query.eventType && query.eventType !== 'all') {
		clauses.push('event_type = ?');
		params.push(query.eventType);
	}
	if (query.householdId) {
		clauses.push('household_id = ?');
		params.push(query.householdId);
	}
	if (query.search?.trim()) {
		clauses.push("description LIKE ? ESCAPE '\\' COLLATE NOCASE");
		params.push(`%${query.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
	}
	if (query.from) {
		clauses.push('created_at >= ?');
		params.push(query.from);
	}
	if (query.to) {
		clauses.push('created_at <= ?');
		params.push(query.to);
	}

	return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function listActivity(query: ActivityQuery = {}): ActivityEntry[] {
	const where = buildWhere(query);
	const rows = getDb()
		.prepare(
			`SELECT * FROM activity_log ${where.sql} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`
		)
		.all(...where.params, query.limit ?? 50, query.offset ?? 0) as ActivityRow[];
	return rows.map(rowToEntry);
}

export function countActivity(query: ActivityQuery = {}): number {
	const where = buildWhere(query);
	const row = getDb()
		.prepare(`SELECT COUNT(*) AS n FROM activity_log ${where.sql}`)
		.get(...where.params) as { n: number };
	return row.n;
}

/** Timestamps of every reminder batch, newest first -- the x-axis of the effectiveness table. */
export function listReminderBatches(limit = 20): ActivityEntry[] {
	return listActivity({ eventType: 'reminder_sent', limit });
}
