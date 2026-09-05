import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guard, isGuardFailure } from '$lib/server/guard';
import {
	backupDirectory,
	createBackup,
	deleteBackup,
	listBackups,
	pruneBackups,
	restoreBackup
} from '$shared/backup';
import { getSetting, logActivity } from '$shared/db';
import { getConfig } from '$shared/config';
import { logError } from '$shared/logger';

/**
 * The backups screen.
 *
 * The snapshots themselves are taken by `shared/backup.ts` -- on a daily timer inside
 * this container, and on demand from here. What this page adds is the half that makes
 * them worth having: seeing that they exist, taking one before something risky, pulling
 * one down to keep somewhere that is not this server, and putting one back.
 *
 * Restoring is the dangerous direction, so it is the one thing here that asks the admin
 * to type a word. Everything else is a button.
 */

/** The typed confirmation a restore will not proceed without. */
const RESTORE_WORD = 'RESTORE';

export const load: PageServerLoad = () => {
	const retentionDays = Number.parseInt(getSetting('backup_retention_days'), 10);

	return {
		// `backupDirectory` creates the directory if it is missing, so an admin opening
		// this page on a fresh deployment sees an empty list rather than an error about
		// a path that has simply never been written to yet.
		directory: backupDirectory(),
		backups: listBackups(),
		retentionDays: Number.isFinite(retentionDays) ? retentionDays : getConfig().backupRetentionDays
	};
};

export const actions: Actions = {
	create: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		try {
			const file = createBackup();
			// Pruning here as well as on the daily timer keeps the directory inside the
			// retention window even on a deployment that is never left running overnight.
			pruneBackups();
			return { success: `Backup created: ${file.filename}` };
		} catch (error) {
			logError('Manual backup failed', error);
			return fail(500, {
				error: 'Could not write a backup. Check that the backups volume is mounted and writable.'
			});
		}
	},

	restore: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const filename = result.form.get('filename')?.toString() ?? '';

		// Checked before anything else: the point of the typed word is that a misclick
		// cannot get past it, and doing the work first would defeat that.
		if (result.form.get('confirm')?.toString().trim() !== RESTORE_WORD) {
			return fail(400, { error: `Type ${RESTORE_WORD} to confirm.` });
		}

		// `restoreBackup` takes a pre-restore snapshot of its own before it touches
		// anything, so restoring the wrong night is itself recoverable.
		if (!restoreBackup(filename)) {
			return fail(400, {
				error: 'That backup could not be restored. The live data is unchanged -- see the logs.'
			});
		}

		return {
			success: `Restored from ${filename}. A copy of the previous data was saved first.`
		};
	},

	delete: async (event) => {
		const result = await guard(event);
		if (isGuardFailure(result)) return result;

		const filename = result.form.get('filename')?.toString() ?? '';
		if (!deleteBackup(filename)) return fail(404, { error: 'That backup is already gone.' });

		// Deleting a snapshot is the one action here that destroys a recovery point
		// without leaving another behind, so it gets its own entry in the audit log
		// rather than borrowing the "created" one.
		logActivity({
			eventType: 'backup_deleted',
			description: `Deleted backup ${filename}`,
			metadata: { filename },
			ipAddress: event.locals.clientIp
		});

		return { success: `Deleted ${filename}.` };
	}
};
