/**
 * The single SQLite connection, shared by every repository in this package.
 *
 * Two containers open the same file off a shared Docker volume, so the settings here
 * are about making that safe rather than fast:
 *
 * - WAL mode lets the guest app keep reading while the admin app writes. Without it a
 *   single admin write would block every guest mid-RSVP.
 * - `busy_timeout` makes a writer wait for the other process's lock instead of
 *   throwing SQLITE_BUSY the instant it sees one.
 * - `foreign_keys` is off by default in SQLite, which would quietly turn every
 *   `ON DELETE CASCADE` in the schema into a no-op.
 *
 * better-sqlite3 is synchronous. That is the right shape here: the queries are all
 * indexed single-row or small-scan reads against a few hundred rows, so they finish in
 * microseconds, and synchronous code cannot interleave two half-finished writes.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getConfig } from '../config';
import { logger } from '../logger';
import { migrate } from './schema';

let instance: DatabaseType | null = null;
let instancePath: string | null = null;

export interface OpenOptions {
	/** Skip the `mkdir -p` for `:memory:` and for tests using a temp file. */
	createDirectory?: boolean;
}

/** Opens a connection, applies the pragmas, and brings the schema up to date. */
export function openDatabase(path: string, options: OpenOptions = {}): DatabaseType {
	if (path !== ':memory:' && options.createDirectory !== false) {
		mkdirSync(dirname(path), { recursive: true });
	}

	const db = new Database(path);

	// An in-memory database has no file to journal to, and WAL is meaningless there.
	if (path !== ':memory:') db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	// FULL would fsync on every commit; NORMAL is the documented safe pairing with WAL
	// and is the difference between a snappy admin table and a visibly slow one.
	db.pragma('synchronous = NORMAL');

	const applied = migrate(db);
	if (applied > 0) {
		logger.info({ event: 'db.migrated', applied, path }, `applied ${applied} migration(s)`);
	}

	return db;
}

/**
 * The process-wide connection, opened on first use.
 *
 * Reopening when DATABASE_PATH changes is what lets a test point the whole package at
 * a temporary file without reaching into module internals.
 */
export function getDb(): DatabaseType {
	const path = getConfig().databasePath;
	if (instance && instancePath === path) return instance;

	if (instance) instance.close();
	instance = openDatabase(path);
	instancePath = path;
	return instance;
}

/** Replaces the shared connection. Tests use this to install an in-memory database. */
export function useDatabase(db: DatabaseType | null, path = ':memory:'): void {
	if (instance && instance !== db) instance.close();
	instance = db;
	instancePath = db ? path : null;
}

export function closeDb(): void {
	if (instance) {
		instance.close();
		instance = null;
		instancePath = null;
	}
}

/** ISO-8601 in UTC: the one timestamp format stored anywhere in this database. */
export function nowIso(): string {
	return new Date().toISOString();
}
