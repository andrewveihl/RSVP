/**
 * The database schema, expressed as an ordered list of migrations.
 *
 * SQLite's `user_version` pragma records how many have been applied. Adding a feature
 * means appending a migration and never editing an earlier one -- an existing
 * deployment has already run the old text, so changing it would silently diverge the
 * couple's live database from a fresh one.
 */
import type { Database } from 'better-sqlite3';

export interface Migration {
	name: string;
	sql: string;
}

export const MIGRATIONS: Migration[] = [
	{
		name: '001-initial',
		sql: `
			CREATE TABLE households (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				token TEXT UNIQUE NOT NULL,
				email TEXT,
				phone TEXT,
				mailing_address TEXT,
				party_size INTEGER NOT NULL DEFAULT 1,
				batch TEXT,
				notes TEXT,
				invitation_sent INTEGER NOT NULL DEFAULT 0,
				invitation_sent_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			-- Every guest arrives by token, so this lookup is the hottest query there is.
			CREATE UNIQUE INDEX idx_households_token ON households(token);
			-- The admin table sorts by name and the fallback searches it.
			CREATE INDEX idx_households_name ON households(name);

			CREATE TABLE rsvps (
				id TEXT PRIMARY KEY,
				household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
				attending INTEGER NOT NULL,
				guest_count INTEGER NOT NULL DEFAULT 1,
				plus_one_count INTEGER NOT NULL DEFAULT 0,
				submitted_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				ip_address TEXT,
				user_agent TEXT
			);

			-- One reply per household: re-submitting updates in place rather than
			-- stacking a second row that the totals would then double-count.
			CREATE UNIQUE INDEX idx_rsvps_household ON rsvps(household_id);
			CREATE INDEX idx_rsvps_submitted ON rsvps(submitted_at);

			CREATE TABLE activity_log (
				id TEXT PRIMARY KEY,
				event_type TEXT NOT NULL,
				description TEXT NOT NULL,
				household_id TEXT REFERENCES households(id) ON DELETE SET NULL,
				metadata TEXT,
				ip_address TEXT,
				created_at TEXT NOT NULL
			);

			CREATE INDEX idx_activity_created ON activity_log(created_at DESC);
			CREATE INDEX idx_activity_type ON activity_log(event_type);
			CREATE INDEX idx_activity_household ON activity_log(household_id);

			CREATE TABLE email_templates (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				subject TEXT NOT NULL,
				body_html TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE email_log (
				id TEXT PRIMARY KEY,
				household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
				template_id TEXT REFERENCES email_templates(id) ON DELETE SET NULL,
				subject TEXT NOT NULL,
				sent_at TEXT NOT NULL,
				status TEXT NOT NULL,
				error TEXT
			);

			CREATE INDEX idx_email_log_household ON email_log(household_id);
			CREATE INDEX idx_email_log_sent ON email_log(sent_at DESC);

			CREATE TABLE site_content (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE site_images (
				id TEXT PRIMARY KEY,
				section TEXT NOT NULL,
				filename TEXT NOT NULL,
				mimetype TEXT NOT NULL,
				data BLOB NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);

			CREATE INDEX idx_site_images_section ON site_images(section, sort_order);

			CREATE TABLE settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`
	},
	{
		name: '002-household-side',
		sql: `
			-- Which side of the family a household belongs to. Optional and free-form
			-- rather than a constrained set, because "both" and "friends of the couple"
			-- are as real as either name.
			ALTER TABLE households ADD COLUMN side TEXT;

			CREATE INDEX idx_households_side ON households(side);
		`
	},
	{
		name: '003-household-extra-guest-cap',
		sql: `
			-- How many guests beyond party_size this household may add when replying.
			-- NULL means no cap, which is what every existing row gets and what the
			-- form did for everyone before this column existed.
			ALTER TABLE households ADD COLUMN max_extra_guests INTEGER;
		`
	}
];

/**
 * Applies every migration the database has not seen yet, inside one transaction each.
 *
 * Returns the number applied, which the caller logs on boot so a surprise migration
 * on a production container is visible in the logs.
 *
 * ## Two containers, one file
 *
 * The guest app and the admin app both open this database, and both call `migrate()`
 * when they boot. Started together -- which is what `docker compose up` does -- they
 * both read the same `user_version`, both decide the same migration is outstanding,
 * and the loser fails on a column the winner has just added. That is not theoretical:
 * migration 003 crash-looped both containers into a 502 exactly this way.
 *
 * So the transaction is `immediate`. That takes SQLite's write lock at `BEGIN` rather
 * than at the first write, which turns the race into a queue: the second container
 * blocks, then finds the version already moved on and skips. `busy_timeout` in
 * `connection.ts` is what gives it something to block *for*.
 *
 * The "duplicate column name" catch below is a separate concern -- it heals a database
 * left inconsistent by this bug *before* it was fixed, where the column exists but the
 * version counter does not know it. New deployments never take that path.
 */
export function migrate(db: Database): number {
	const version = () => db.pragma('user_version', { simple: true }) as number;
	let applied = 0;

	for (let index = 0; index < MIGRATIONS.length; index += 1) {
		// Re-read each time rather than once up front: the other container may have
		// applied several while this loop was waiting on the lock below.
		if (version() > index) continue;

		const migration = MIGRATIONS[index];

		try {
			const ran = db.transaction(() => {
				// Checked again, now holding the write lock. Between the read above and
				// acquiring it, the other process may have finished this very migration.
				if (version() > index) return false;

				db.exec(migration.sql);
				// The pragma cannot be parameterised, so the value is interpolated -- it is
				// a loop counter, never anything a user supplied.
				db.pragma(`user_version = ${index + 1}`);
				return true;
			}).immediate();

			if (ran) applied += 1;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);

			// Deliberately narrow. Swallowing "already exists" wholesale would let a
			// genuinely wrong migration look like a successful one; this matches only
			// the specific state the pre-fix race could leave behind.
			if (!message.includes('duplicate column name')) throw error;

			db.pragma(`user_version = ${index + 1}`);
			applied += 1;
		}
	}

	return applied;
}
