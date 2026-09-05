import { error } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import type { RequestHandler } from './$types';
import { getBackup } from '$shared/backup';
import { logError } from '$shared/logger';

/**
 * Hands one backup file to the admin.
 *
 * A backup is the whole guest list -- names, addresses, and every household's RSVP
 * token -- so this sits behind the session and is never cached. It is also why the
 * filename is resolved through `getBackup` rather than joined onto the backup directory
 * here: that helper matches the name against the pattern this app writes and then finds
 * it in the directory listing, so `?file=../../etc/passwd` resolves to nothing rather
 * than to a path.
 *
 * Read into memory rather than streamed. A `VACUUM INTO` copy of a wedding's database
 * is a few megabytes at the outside, and Node's stream type does not line up with the
 * one `Response` wants -- which would mean a cast that hides exactly the sort of
 * mismatch worth being told about.
 */
export const GET: RequestHandler = ({ url, locals, setHeaders }) => {
	if (!locals.admin) error(401, 'Not signed in.');

	const backup = getBackup(url.searchParams.get('file') ?? '');
	if (!backup) error(404, 'No such backup.');

	let bytes: Buffer;
	try {
		bytes = readFileSync(backup.path);
	} catch (cause) {
		// Listed a moment ago but unreadable now: pruned between the two, or the volume
		// went away. Either way it is a 404 rather than a 500 the admin cannot act on.
		logError('Could not read a backup for download', cause, { filename: backup.filename });
		error(404, 'That backup could not be read.');
	}

	setHeaders({
		'content-type': 'application/vnd.sqlite3',
		'content-length': String(bytes.length),
		// The filename comes from `getBackup`, so it matches the backup pattern and
		// carries nothing that could break out of the quotes.
		'content-disposition': `attachment; filename="${backup.filename}"`,
		'cache-control': 'no-store'
	});

	return new Response(new Uint8Array(bytes));
};
