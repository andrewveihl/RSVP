/**
 * Takes a backup from the command line.
 *
 *     docker compose exec admin node /repo/scripts/backup.js
 *     node scripts/backup.js                       # against a local dev database
 *
 * The admin container already runs this on a daily timer, so this script is for the
 * moments in between: before a bulk import, before a restore, or from a host cron job
 * if you would rather schedule it there.
 *
 * It is safe to run while both containers are serving traffic -- `VACUUM INTO` takes a
 * consistent snapshot of a live database rather than copying the file underneath it,
 * which in WAL mode would also miss whatever was still in the `-wal` sidecar.
 *
 * Deliberately self-contained: the runtime image holds the *compiled* apps, not the
 * shared TypeScript sources, so a CLI script cannot import from `shared/src`.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const DATABASE_PATH = process.env.DATABASE_PATH ?? '/data/wedding-rsvp.db';
const BACKUP_DIR = process.env.BACKUP_DIR ?? '/backups';
const RETENTION_DAYS = Number.parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10) || 30;

// Must match `shared/src/backup.ts`, which lists and restores the same files.
const PREFIX = 'wedding-rsvp-';
const SUFFIX = '.db';

if (!existsSync(DATABASE_PATH)) {
	console.error(`No database at ${DATABASE_PATH}. Set DATABASE_PATH if it lives elsewhere.`);
	process.exit(1);
}

mkdirSync(BACKUP_DIR, { recursive: true });

const filename = `${PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}${SUFFIX}`;
const target = join(BACKUP_DIR, filename);

const db = new Database(DATABASE_PATH, { readonly: false });
try {
	db.pragma('busy_timeout = 10000');
	// The path is built from a timestamp and an environment variable, never from user
	// input; single quotes are doubled in case the mount path contains one.
	db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
	db.close();
}

const size = statSync(target).size;
const mb = (size / 1024 / 1024).toFixed(1);
console.log(`Backed up to ${target} (${mb} MB)`);

// --- Prune ------------------------------------------------------------------
const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
let removed = 0;

for (const name of readdirSync(BACKUP_DIR)) {
	if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) continue;

	const path = join(BACKUP_DIR, name);
	if (statSync(path).mtime.getTime() >= cutoff) continue;

	unlinkSync(path);
	removed += 1;
}

if (removed > 0) {
	console.log(`Removed ${removed} backup(s) older than ${RETENTION_DAYS} days.`);
}
