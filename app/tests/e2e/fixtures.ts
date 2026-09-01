/**
 * The guest list the E2E suite runs against.
 *
 * Written straight into SQLite rather than through the admin app: the specs are about
 * the *guest* site, and building the fixture through a second application would make
 * every guest-site failure ambiguous.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

export const DATABASE_PATH = './.e2e-data/wedding.db';

export interface Fixture {
	name: string;
	token: string;
}

/** Fixed tokens, so a spec can navigate straight to a household's page. */
export const HOUSEHOLDS = {
	pending: { name: 'The Whitfield Family', token: 'e2e-pending-token-000000000000000' },
	attending: { name: 'The Marsh Family', token: 'e2e-attending-token-00000000000000' },
	declined: { name: 'The Okonkwo Family', token: 'e2e-declined-token-000000000000000' },
	// Two households sharing a word, so the look-up has something to disambiguate.
	ambiguousA: { name: 'The Bell Family', token: 'e2e-bell-a-token-00000000000000000' },
	ambiguousB: { name: 'The Bellingham Family', token: 'e2e-bell-b-token-00000000000000000' }
} as const;

/**
 * Drops any previous database and builds a fresh one.
 *
 * The schema comes from the app itself: this opens the file, lets the app's migrations
 * run on first boot, and only then inserts. Rather than duplicate the DDL here, the
 * fixture inserts *after* the server has started -- see `global-setup.ts`.
 */
export function resetDatabase(): void {
	mkdirSync(dirname(DATABASE_PATH), { recursive: true });
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${DATABASE_PATH}${suffix}`, { force: true });
	}
}

/**
 * Inserts a household just for the calling spec.
 *
 * Any spec that *changes* an RSVP uses this rather than a shared fixture. The suite
 * runs against one database and every project runs every spec, so a spec that mutates
 * a shared household would pass on the first project and fail on the second -- and the
 * failure would look like a mobile-layout bug rather than what it is.
 */
export function createHousehold(
	label: string,
	rsvp?: { attending: boolean; guestCount: number; plusOneCount: number }
): Fixture {
	const db = new Database(DATABASE_PATH);
	db.pragma('foreign_keys = ON');

	const now = new Date().toISOString();
	const id = randomUUID();
	const token = randomBytes(24).toString('base64url');
	// The label is suffixed, so two projects running the same spec do not collide on
	// a name the look-up would then find twice.
	const name = `${label} ${randomBytes(3).toString('hex')}`;

	try {
		db.prepare(
			`INSERT INTO households
				(id, name, token, email, phone, mailing_address, party_size, batch, notes,
				 invitation_sent, invitation_sent_at, created_at, updated_at)
			 VALUES (?, ?, ?, NULL, NULL, NULL, 3, 'E2E', NULL, 0, NULL, ?, ?)`
		).run(id, name, token, now, now);

		if (rsvp) {
			db.prepare(
				`INSERT INTO rsvps
					(id, household_id, attending, guest_count, plus_one_count, submitted_at, updated_at, ip_address, user_agent)
				 VALUES (?, ?, ?, ?, ?, ?, ?, '127.0.0.1', 'e2e')`
			).run(
				randomUUID(),
				id,
				rsvp.attending ? 1 : 0,
				rsvp.guestCount,
				rsvp.plusOneCount,
				now,
				now
			);
		}
	} finally {
		db.close();
	}

	return { name, token };
}

export function seed(): void {
	const db = new Database(DATABASE_PATH);
	db.pragma('foreign_keys = ON');

	const now = new Date().toISOString();

	const insertHousehold = db.prepare(
		`INSERT INTO households
			(id, name, token, email, phone, mailing_address, party_size, batch, notes,
			 invitation_sent, invitation_sent_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, NULL, ?, ?, 'E2E', NULL, 0, NULL, ?, ?)`
	);
	const insertRsvp = db.prepare(
		`INSERT INTO rsvps
			(id, household_id, attending, guest_count, plus_one_count, submitted_at, updated_at, ip_address, user_agent)
		 VALUES (?, ?, ?, ?, ?, ?, ?, '127.0.0.1', 'e2e')`
	);

	const ids: Record<string, string> = {};

	db.transaction(() => {
		for (const [key, household] of Object.entries(HOUSEHOLDS)) {
			const id = randomUUID();
			ids[key] = id;
			insertHousehold.run(
				id,
				household.name,
				household.token,
				`${key}@example.com`,
				`${1} Test Road, Testville, TS 00001`,
				3,
				now,
				now
			);
		}

		// One household has already accepted and one has already declined, so the
		// "update your reply" and "you already replied" paths have something to show.
		insertRsvp.run(randomUUID(), ids.attending, 1, 2, 1, now, now);
		insertRsvp.run(randomUUID(), ids.declined, 0, 0, 0, now, now);

		// A handful of extras, so listings and searches are not trivially short.
		for (let index = 0; index < 5; index += 1) {
			insertHousehold.run(
				randomUUID(),
				`The Filler ${index} Family`,
				randomBytes(24).toString('base64url'),
				null,
				'2 Test Road, Testville, TS 00002',
				2,
				now,
				now
			);
		}
	})();

	db.close();
}
