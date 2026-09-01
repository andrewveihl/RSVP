/**
 * Builds the E2E database before Playwright starts the server.
 *
 * The schema comes from the application's own migration list, imported directly, so
 * the fixture can never drift from the real schema -- a copy of the DDL here would be
 * one more thing to keep in step, and the first symptom of it going stale would be a
 * confusing E2E failure rather than an obvious one.
 *
 * The import is relative rather than through `$shared`, because Playwright's loader
 * does not know about SvelteKit's aliases.
 */
import Database from 'better-sqlite3';
import { migrate } from '../../../shared/src/db/schema';
import { DATABASE_PATH, resetDatabase, seed } from './fixtures';

export default function globalSetup(): void {
	resetDatabase();

	const db = new Database(DATABASE_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	migrate(db);
	db.close();

	seed();
}
