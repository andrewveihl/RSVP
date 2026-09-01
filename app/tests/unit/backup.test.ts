import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	backupFilename,
	createBackup,
	deleteBackup,
	formatBytes,
	getBackup,
	listBackups,
	pruneBackups,
	restoreBackup
} from '$shared/backup';
import { closeDb, openDatabase, useDatabase } from '$shared/db/connection';
import { countHouseholds, createHousehold } from '$shared/db/households';
import { listActivity } from '$shared/db/activity';

/**
 * These tests need a real file on disk: `VACUUM INTO` cannot copy an in-memory
 * database, and the whole point of the backup module is what it does to files.
 */
let workspace: string;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), 'rsvp-backup-'));
	process.env.DATABASE_PATH = join(workspace, 'wedding.db');
	process.env.BACKUP_DIR = join(workspace, 'backups');
	useDatabase(openDatabase(process.env.DATABASE_PATH));
});

afterEach(() => {
	closeDb();
	delete process.env.DATABASE_PATH;
	delete process.env.BACKUP_DIR;
	delete process.env.BACKUP_RETENTION_DAYS;
	rmSync(workspace, { recursive: true, force: true });
});

describe('backup filenames', () => {
	it('is filesystem-safe and sorts chronologically', () => {
		const name = backupFilename(new Date('2027-05-29T14:32:05.123Z'));
		expect(name).toBe('wedding-rsvp-2027-05-29T14-32-05-123Z.db');
		expect(name).not.toMatch(/[:*?"<>|]/);
	});
});

describe('creating backups', () => {
	it('writes a complete, openable copy of the database', () => {
		createHousehold({ name: 'The Smiths' });

		const backup = createBackup();

		expect(existsSync(backup.path)).toBe(true);
		expect(backup.sizeBytes).toBeGreaterThan(0);

		// The copy is a real database, with the row in it.
		const copy = openDatabase(backup.path, { createDirectory: false });
		const row = copy.prepare('SELECT COUNT(*) AS n FROM households').get() as { n: number };
		expect(row.n).toBe(1);
		copy.close();
	});

	it('records itself in the activity log', () => {
		createBackup();
		expect(listActivity()[0].eventType).toBe('backup_created');
	});

	it('lists backups newest first', async () => {
		const first = createBackup(new Date('2027-01-01T00:00:00Z'));
		await new Promise((resolve) => setTimeout(resolve, 15));
		const second = createBackup(new Date('2027-01-02T00:00:00Z'));

		const listed = listBackups().map((backup) => backup.filename);
		expect(listed).toHaveLength(2);
		expect(listed).toContain(first.filename);
		expect(listed).toContain(second.filename);
	});

	it('returns an empty list before the directory exists', () => {
		expect(listBackups()).toEqual([]);
	});
});

describe('pruning', () => {
	it('removes backups past the retention window and keeps the rest', () => {
		const old = createBackup(new Date('2027-01-01T00:00:00Z'));
		const recent = createBackup();

		// mtime is what the pruner reads, so age the file rather than trusting its name.
		const longAgo = new Date(Date.now() - 60 * 86_400_000);
		utimesSync(old.path, longAgo, longAgo);

		expect(pruneBackups(30)).toBe(1);

		const remaining = listBackups().map((backup) => backup.filename);
		expect(remaining).toEqual([recent.filename]);
	});

	it('removes nothing when everything is inside the window', () => {
		createBackup();
		expect(pruneBackups(30)).toBe(0);
	});
});

describe('addressing backups by name', () => {
	it('ignores files it did not write', () => {
		createBackup();
		writeFileSync(join(process.env.BACKUP_DIR!, 'notes.txt'), 'hello');
		writeFileSync(join(process.env.BACKUP_DIR!, 'wedding-rsvp-fake.txt'), 'hello');

		expect(listBackups()).toHaveLength(1);
		expect(getBackup('notes.txt')).toBeNull();
		expect(deleteBackup('notes.txt')).toBe(false);
	});

	it('refuses a traversal attempt', () => {
		// The path is never built from the name -- only a matching, existing entry
		// from the directory listing is ever returned.
		expect(getBackup('../../../etc/passwd')).toBeNull();
		expect(getBackup('wedding-rsvp-../escape.db')).toBeNull();
		expect(restoreBackup('../../../etc/passwd')).toBe(false);
	});
});

describe('restoring', () => {
	it('brings back the database as it was, and keeps a safety copy', () => {
		createHousehold({ name: 'Present at backup time' });
		const backup = createBackup();

		createHousehold({ name: 'Added afterwards' });
		expect(countHouseholds()).toBe(2);

		expect(restoreBackup(backup.filename)).toBe(true);

		// Same connection, same file -- the rows were replaced inside SQLite rather
		// than the file being swapped underneath anybody.
		expect(countHouseholds()).toBe(1);

		const safety = listBackups().filter((file) => file.filename.includes('pre-restore'));
		expect(safety).toHaveLength(1);

		// And the safety copy really does hold the pre-restore state.
		const copy = openDatabase(safety[0].path, { createDirectory: false });
		const row = copy.prepare('SELECT COUNT(*) AS n FROM households').get() as { n: number };
		expect(row.n).toBe(2);
		copy.close();
	});

	it('reports a restore in the activity log', () => {
		const backup = createBackup();
		restoreBackup(backup.filename);
		expect(listActivity().some((entry) => entry.eventType === 'backup_restored')).toBe(true);
	});

	it('returns false for a backup that does not exist', () => {
		expect(restoreBackup('wedding-rsvp-2000-01-01T00-00-00-000Z.db')).toBe(false);
	});
});

describe('formatBytes', () => {
	it('scales the unit to the size', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
	});
});

describe('restoring while another process holds the database open', () => {
	/**
	 * The production shape: the guest container and the admin container have the same
	 * file open at once. This is the case that a close-swap-reopen restore gets wrong,
	 * so it gets its own test.
	 */
	it('leaves a second open connection reading the restored data', () => {
		createHousehold({ name: 'Present at backup time' });
		const backup = createBackup();
		createHousehold({ name: 'Added afterwards' });

		// Stand in for the other container: a separate connection to the same file,
		// open across the whole restore and never told about it.
		const other = openDatabase(process.env.DATABASE_PATH!, { createDirectory: false });
		try {
			expect((other.prepare('SELECT COUNT(*) AS n FROM households').get() as { n: number }).n).toBe(2);

			expect(restoreBackup(backup.filename)).toBe(true);

			// It sees the restored rows on its next read, with no reconnect and no error.
			expect((other.prepare('SELECT COUNT(*) AS n FROM households').get() as { n: number }).n).toBe(1);
		} finally {
			other.close();
		}
	});

	it('leaves no staging file behind', () => {
		const backup = createBackup();
		restoreBackup(backup.filename);

		const leftovers = readdirSync(process.env.BACKUP_DIR!).filter((name) =>
			name.endsWith('.restoring')
		);
		expect(leftovers).toEqual([]);
	});
});
