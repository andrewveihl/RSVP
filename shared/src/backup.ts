/**
 * SQLite backups.
 *
 * Copying the database file with `cp` while another process is mid-write can produce a
 * torn snapshot -- and in WAL mode it also silently leaves the recent commits behind in
 * the `-wal` sidecar. So every backup goes through SQLite's own `VACUUM INTO`, which
 * takes a consistent, fully checkpointed copy of a live database and compacts it on the
 * way out.
 *
 * The result is one self-contained file per backup: nothing to keep together, and
 * nothing to reassemble. Restoring is the harder direction and is explained at
 * `restoreBackup`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from './config';
import { getDb, openDatabase } from './db/connection';
import { logActivity } from './db/activity';
import { logError, logger } from './logger';
// `formatBytes` lives in `format.ts` -- a module with no Node imports -- so the
// Backups page can render a file size without pulling `node:fs` into the browser
// bundle. Re-exported here so server code still has one import for backups.
import { formatBytes } from './format';
export { formatBytes };

const FILE_PREFIX = 'wedding-rsvp-';
const FILE_SUFFIX = '.db';

export interface BackupFile {
	filename: string;
	path: string;
	sizeBytes: number;
	createdAt: string;
}

/** A filename-safe ISO stamp: 2027-05-29T14-32-05-123Z. */
export function backupFilename(now = new Date()): string {
	return `${FILE_PREFIX}${now.toISOString().replace(/[:.]/g, '-')}${FILE_SUFFIX}`;
}

/**
 * Only files this module wrote are ever listed, deleted or restored.
 *
 * The backup directory is a mounted volume that could hold anything; matching the
 * name pattern is what stops a stray file being offered as a restore candidate, and
 * stops a path from a request ever addressing something outside the directory.
 */
function isBackupName(name: string): boolean {
	return name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX) && !name.includes('/') && !name.includes('\\');
}

export function backupDirectory(): string {
	const dir = getConfig().backupDir;
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function listBackups(): BackupFile[] {
	const dir = getConfig().backupDir;
	if (!existsSync(dir)) return [];

	return readdirSync(dir)
		.filter(isBackupName)
		.map((filename) => {
			const path = join(dir, filename);
			const stats = statSync(path);
			return {
				filename,
				path,
				sizeBytes: stats.size,
				createdAt: stats.mtime.toISOString()
			};
		})
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createBackup(now = new Date()): BackupFile {
	const dir = backupDirectory();
	const filename = backupFilename(now);
	const path = join(dir, filename);

	// VACUUM INTO refuses to overwrite, so a same-millisecond collision would throw.
	// Practically impossible, but the guard costs one branch.
	if (existsSync(path)) unlinkSync(path);

	// The path is interpolated because SQLite does not accept a bound parameter here.
	// It is built from a timestamp and the configured directory, never from user input,
	// and the single quotes are escaped in case the mount path contains one.
	getDb().exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);

	const stats = statSync(path);
	const file: BackupFile = {
		filename,
		path,
		sizeBytes: stats.size,
		createdAt: stats.mtime.toISOString()
	};

	logger.info({ event: 'backup.created', filename, sizeBytes: file.sizeBytes }, 'backup created');
	logActivity({
		eventType: 'backup_created',
		description: `Backup created (${formatBytes(file.sizeBytes)})`,
		metadata: { filename, sizeBytes: file.sizeBytes }
	});

	return file;
}

/** Deletes backups older than the retention window. Returns how many went. */
export function pruneBackups(retentionDays = getConfig().backupRetentionDays, now = new Date()): number {
	const cutoff = now.getTime() - retentionDays * 86_400_000;
	let removed = 0;

	for (const backup of listBackups()) {
		if (new Date(backup.createdAt).getTime() >= cutoff) continue;
		try {
			unlinkSync(backup.path);
			removed += 1;
		} catch (error) {
			logError('Could not delete an expired backup', error, { filename: backup.filename });
		}
	}

	if (removed > 0) {
		logger.info({ event: 'backup.pruned', removed, retentionDays }, `pruned ${removed} backup(s)`);
	}
	return removed;
}

export function getBackup(filename: string): BackupFile | null {
	if (!isBackupName(filename)) return null;
	return listBackups().find((backup) => backup.filename === filename) ?? null;
}

export function deleteBackup(filename: string): boolean {
	const backup = getBackup(filename);
	if (!backup) return false;
	unlinkSync(backup.path);
	return true;
}

/**
 * The tables a restore replaces, children before parents so the deletes do not trip
 * over a foreign key. `settings` and `site_content` have no relationships at all.
 */
const RESTORE_TABLES = [
	'email_log',
	'rsvps',
	'activity_log',
	'email_templates',
	'households',
	'site_content',
	'site_images',
	'settings'
] as const;

/**
 * Replaces the live data with a backup's.
 *
 * The obvious implementation -- close the connection, swap the file, reopen -- is
 * wrong here, and the reason is the whole architecture: the guest container has the
 * same file open at the same time. Deleting its WAL sidecar out from under it fails
 * outright on Windows and, worse, silently corrupts what that process is reading on
 * Linux. One process cannot swap a file another process is using.
 *
 * So the restore happens *inside* SQLite instead. The snapshot is attached and its
 * rows are copied over the live tables in a single transaction: the other container
 * sees the old data until the commit and the new data after it, with no moment in
 * between and nothing to reopen.
 *
 * The current data is preserved alongside the backups as a `pre-restore` copy first --
 * restoring the wrong night's snapshot should itself be recoverable.
 */
export function restoreBackup(filename: string, now = new Date()): boolean {
	const backup = getBackup(filename);
	if (!backup) return false;

	const safety = join(
		backupDirectory(),
		`${FILE_PREFIX}pre-restore-${now.toISOString().replace(/[:.]/g, '-')}${FILE_SUFFIX}`
	);

	try {
		createBackupTo(safety);
	} catch (error) {
		logError('Could not take a pre-restore snapshot; restore aborted', error, { filename });
		return false;
	}

	const db = getDb();

	// A snapshot from an older build has an older schema. Bringing a *copy* up to date
	// first means the column lists below line up -- and it is a copy, so a migration
	// that goes wrong cannot damage the backup itself.
	const staging = `${backup.path}.restoring`;
	if (existsSync(staging)) unlinkSync(staging);
	copyFileSync(backup.path, staging);

	try {
		const snapshot = openDatabase(staging, { createDirectory: false });
		snapshot.close();

		db.exec(`ATTACH DATABASE '${staging.replace(/'/g, "''")}' AS snapshot`);

		// Foreign keys are enforced per connection, not per transaction, so they are
		// switched off around the swap -- during it the tables are legitimately
		// inconsistent. SQLite ignores this pragma inside a transaction, hence the
		// ordering here.
		db.pragma('foreign_keys = OFF');
		try {
			db.transaction(() => {
				for (const table of RESTORE_TABLES) db.exec(`DELETE FROM main.${table}`);
				// Reversed, so parents are inserted before the rows referencing them.
				for (const table of [...RESTORE_TABLES].reverse()) {
					db.exec(`INSERT INTO main.${table} SELECT * FROM snapshot.${table}`);
				}
			})();
		} finally {
			db.pragma('foreign_keys = ON');
			db.exec('DETACH DATABASE snapshot');
		}
	} catch (error) {
		logError('Restore failed; the live database is unchanged', error, { filename });
		return false;
	} finally {
		if (existsSync(staging)) unlinkSync(staging);
	}

	logger.warn({ event: 'backup.restored', filename }, 'database restored from backup');
	logActivity({
		eventType: 'backup_restored',
		description: `Database restored from ${filename}`,
		metadata: { filename, safetyCopy: safety }
	});

	return true;
}

function createBackupTo(path: string): void {
	if (existsSync(path)) unlinkSync(path);
	getDb().exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
}

/**
 * Runs a backup now and prunes the old ones. The admin container calls this on boot
 * and then daily; the CLI script calls it from cron.
 */
export function runScheduledBackup(): { file: BackupFile | null; pruned: number } {
	try {
		const file = createBackup();
		const pruned = pruneBackups();
		return { file, pruned };
	} catch (error) {
		logError('Scheduled backup failed', error);
		return { file: null, pruned: 0 };
	}
}
