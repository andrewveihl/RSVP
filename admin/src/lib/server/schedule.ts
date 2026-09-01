/**
 * The daily backup timer.
 *
 * It lives inside the admin container rather than in a cron entry on the host, so the
 * whole thing stays a `docker compose up` with nothing to remember to install
 * alongside it. The admin container is the right home: it is the one that already
 * mounts the backups volume, and only one process should be writing snapshots.
 *
 * A boot-time backup runs first, which means a container that is restarted daily still
 * produces daily snapshots even if the interval never gets to fire.
 */
import { runScheduledBackup } from '$shared/backup';
import { logError, logger } from '$shared/logger';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Long enough after boot that a restart loop cannot spam the backup directory. */
const FIRST_RUN_DELAY_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

export function startBackupSchedule(): void {
	if (timer) return;

	const run = () => {
		try {
			const { file, pruned } = runScheduledBackup();
			if (file) {
				logger.info(
					{ event: 'backup.scheduled', filename: file.filename, pruned },
					'scheduled backup complete'
				);
			}
		} catch (error) {
			logError('Scheduled backup threw', error);
		}
	};

	// `unref` so the timer never holds the process open during a shutdown.
	setTimeout(run, FIRST_RUN_DELAY_MS).unref();
	timer = setInterval(run, DAY_MS);
	timer.unref();

	logger.info({ event: 'backup.scheduled_started' }, 'daily backup schedule started');
}

export function stopBackupSchedule(): void {
	if (!timer) return;
	clearInterval(timer);
	timer = null;
}
