/**
 * Builds the admin suite's database before Playwright starts the server.
 *
 * The schema comes from the application's own migration list, imported directly, so a
 * fixture can never drift from the real schema. The import is relative rather than
 * through `$shared`, because Playwright's loader does not know SvelteKit's aliases.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from '../../../shared/src/db/schema';

export const DATABASE_PATH = './.e2e-data/wedding.db';
export const BACKUP_DIR = './.e2e-data/backups';

/** Households the specs can rely on being there, in a known state. */
export const SEEDED = {
	pending: 'The Whitfield Family',
	attending: 'The Marsh Family',
	declined: 'The Okonkwo Family'
} as const;

export default function globalSetup(): void {
	mkdirSync(dirname(DATABASE_PATH), { recursive: true });
	rmSync(BACKUP_DIR, { recursive: true, force: true });
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${DATABASE_PATH}${suffix}`, { force: true });
	}

	const db = new Database(DATABASE_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	migrate(db);

	const now = new Date().toISOString();
	const insertHousehold = db.prepare(
		`INSERT INTO households
			(id, name, token, email, phone, mailing_address, party_size, batch, notes,
			 invitation_sent, invitation_sent_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, 0, NULL, ?, ?)`
	);
	const insertRsvp = db.prepare(
		`INSERT INTO rsvps
			(id, household_id, attending, guest_count, plus_one_count, submitted_at, updated_at, ip_address, user_agent)
		 VALUES (?, ?, ?, ?, ?, ?, ?, '127.0.0.1', 'e2e')`
	);

	db.transaction(() => {
		const ids: Record<string, string> = {};

		for (const [key, name] of Object.entries(SEEDED)) {
			const id = randomUUID();
			ids[key] = id;
			insertHousehold.run(
				id,
				name,
				`e2e-${key}-token-000000000000000000`,
				`${key}@example.com`,
				`${1} Test Road, Testville, TS 00001`,
				3,
				'Batch 1',
				now,
				now
			);
		}

		insertRsvp.run(randomUUID(), ids.attending, 1, 2, 1, now, now);
		insertRsvp.run(randomUUID(), ids.declined, 0, 0, 0, now, now);
	})();

	db.close();
}
