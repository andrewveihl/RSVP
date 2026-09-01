/**
 * Site images, stored as BLOBs in the database.
 *
 * A separate uploads volume would be one more thing to mount into two containers, keep
 * in step and remember to back up. These are a handful of wedding photos, so putting
 * them in the same file as everything else means one backup covers the whole site.
 *
 * Listings deliberately never SELECT the `data` column -- a gallery page that pulled
 * twenty full images into memory to render twenty `<img>` tags would be pointless.
 */
import type { SiteImage } from '../types';
import { getDb, nowIso } from './connection';
import { newId } from '../tokens';

/** The formats a browser will render inline, and nothing else. */
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

/** Comfortably above a resized wedding photo, well below anything that hurts SQLite. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface ImageRow {
	id: string;
	section: string;
	filename: string;
	mimetype: string;
	sort_order: number;
	created_at: string;
	data?: Buffer;
}

function rowToImage(row: ImageRow): SiteImage {
	return {
		id: row.id,
		section: row.section,
		filename: row.filename,
		mimetype: row.mimetype,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		...(row.data ? { data: row.data } : {})
	};
}

/**
 * Confirms the bytes really are the image type they claim to be.
 *
 * The browser's declared MIME type is guest-supplied metadata; the magic bytes are the
 * file itself. Checking them stops an HTML file with an `image/png` label being served
 * back from `/images/[id]` with a type the browser would then render as a document.
 */
export function detectImageType(bytes: Uint8Array): string | null {
	if (bytes.length < 12) return null;

	// JPEG: FF D8 FF
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

	// PNG: 89 50 4E 47 0D 0A 1A 0A
	const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (png.every((byte, index) => bytes[index] === byte)) return 'image/png';

	// GIF87a / GIF89a
	if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';

	// RIFF....WEBP
	const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
	const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
	if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';

	// ISO-BMFF box with an 'ftyp' header whose brand starts 'avi' (avif / avis).
	const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
	const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10]);
	if (ftyp === 'ftyp' && brand === 'avi') return 'image/avif';

	return null;
}

export interface StoreImageInput {
	section: string;
	filename: string;
	data: Buffer;
	/** Only used as a hint; the magic bytes decide what is actually stored. */
	mimetype?: string;
	sortOrder?: number;
}

export class ImageRejected extends Error {}

export function storeImage(input: StoreImageInput): SiteImage {
	if (input.data.length === 0) throw new ImageRejected('That file is empty.');
	if (input.data.length > MAX_IMAGE_BYTES) {
		throw new ImageRejected(`Images must be under ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`);
	}

	const detected = detectImageType(input.data);
	if (!detected || !ALLOWED_IMAGE_TYPES.has(detected)) {
		throw new ImageRejected('That does not look like a JPEG, PNG, WebP, GIF or AVIF image.');
	}

	const row: ImageRow = {
		id: newId(),
		section: input.section,
		// Only the basename, and only characters that are safe in a Content-Disposition.
		filename: input.filename.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'image',
		mimetype: detected,
		sort_order: input.sortOrder ?? nextSortOrder(input.section),
		created_at: nowIso()
	};

	getDb()
		.prepare(
			`INSERT INTO site_images (id, section, filename, mimetype, data, sort_order, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(row.id, row.section, row.filename, row.mimetype, input.data, row.sort_order, row.created_at);

	return rowToImage(row);
}

function nextSortOrder(section: string): number {
	const row = getDb()
		.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM site_images WHERE section = ?')
		.get(section) as { next: number };
	return row.next;
}

/** Metadata plus bytes -- only the image endpoint should call this. */
export function getImage(id: string): SiteImage | null {
	const row = getDb().prepare('SELECT * FROM site_images WHERE id = ?').get(id) as
		| ImageRow
		| undefined;
	return row ? rowToImage(row) : null;
}

export function listImages(section?: string): SiteImage[] {
	const where = section ? 'WHERE section = ?' : '';
	const params = section ? [section] : [];
	const rows = getDb()
		.prepare(
			`SELECT id, section, filename, mimetype, sort_order, created_at
			 FROM site_images ${where} ORDER BY section, sort_order, created_at`
		)
		.all(...params) as ImageRow[];
	return rows.map(rowToImage);
}

export function deleteImage(id: string): boolean {
	return getDb().prepare('DELETE FROM site_images WHERE id = ?').run(id).changes > 0;
}

/** Writes an explicit order for a section, from the editor's drag-to-reorder list. */
export function reorderImages(ids: string[]): void {
	const db = getDb();
	const update = db.prepare('UPDATE site_images SET sort_order = ? WHERE id = ?');
	db.transaction(() => {
		ids.forEach((id, index) => update.run(index, id));
	})();
}
