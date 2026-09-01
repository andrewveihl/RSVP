/**
 * A minimal ZIP writer, store-only (no compression).
 *
 * The only things this archive ever holds are PDFs and PNGs, both of which are already
 * compressed -- deflating them again would spend CPU to save a percent or two. Storing
 * them means no compression library, which in turn means no dependency whose job is to
 * parse untrusted input.
 *
 * The format written is the plain 1989 ZIP: local file headers, then a central
 * directory, then an end-of-central-directory record. Everything is little-endian.
 */
import { crc32 } from './crc32';

interface Entry {
	name: string;
	data: Uint8Array;
	crc: number;
	offset: number;
}

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_RECORD_SIG = 0x06054b50;
/** "Created by MS-DOS, version 2.0" -- what every writer puts here for stored files. */
const VERSION = 20;
/** Bit 11: the filename is UTF-8, not the ancient IBM code page. */
const UTF8_FLAG = 0x0800;

/** DOS date/time, which is what ZIP stores. Seconds have two-second resolution. */
function dosDateTime(date: Date): { time: number; date: number } {
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
		// The DOS epoch is 1980; anything earlier cannot be represented, so clamp.
		date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
	};
}

export function createZip(files: { name: string; data: Uint8Array }[], now = new Date()): Buffer {
	const stamp = dosDateTime(now);
	const chunks: Buffer[] = [];
	const entries: Entry[] = [];
	let offset = 0;

	for (const file of files) {
		const name = Buffer.from(file.name, 'utf8');
		const crc = crc32(file.data);

		const header = Buffer.alloc(30);
		header.writeUInt32LE(LOCAL_HEADER_SIG, 0);
		header.writeUInt16LE(VERSION, 4);
		header.writeUInt16LE(UTF8_FLAG, 6);
		header.writeUInt16LE(0, 8); // 0 = stored
		header.writeUInt16LE(stamp.time, 10);
		header.writeUInt16LE(stamp.date, 12);
		header.writeUInt32LE(crc, 14);
		header.writeUInt32LE(file.data.length, 18); // compressed size
		header.writeUInt32LE(file.data.length, 22); // uncompressed size
		header.writeUInt16LE(name.length, 26);
		header.writeUInt16LE(0, 28); // extra field length

		chunks.push(header, name, Buffer.from(file.data));
		entries.push({ name: file.name, data: file.data, crc, offset });
		offset += header.length + name.length + file.data.length;
	}

	const centralStart = offset;

	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const record = Buffer.alloc(46);
		record.writeUInt32LE(CENTRAL_HEADER_SIG, 0);
		record.writeUInt16LE(VERSION, 4); // version made by
		record.writeUInt16LE(VERSION, 6); // version needed
		record.writeUInt16LE(UTF8_FLAG, 8);
		record.writeUInt16LE(0, 10); // stored
		record.writeUInt16LE(stamp.time, 12);
		record.writeUInt16LE(stamp.date, 14);
		record.writeUInt32LE(entry.crc, 16);
		record.writeUInt32LE(entry.data.length, 20);
		record.writeUInt32LE(entry.data.length, 24);
		record.writeUInt16LE(name.length, 28);
		record.writeUInt16LE(0, 30); // extra
		record.writeUInt16LE(0, 32); // comment
		record.writeUInt16LE(0, 34); // disk number
		record.writeUInt16LE(0, 36); // internal attributes
		record.writeUInt32LE(0, 38); // external attributes
		record.writeUInt32LE(entry.offset, 42);

		chunks.push(record, name);
		offset += record.length + name.length;
	}

	const end = Buffer.alloc(22);
	end.writeUInt32LE(END_RECORD_SIG, 0);
	end.writeUInt16LE(0, 4); // this disk
	end.writeUInt16LE(0, 6); // disk with central directory
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(offset - centralStart, 12);
	end.writeUInt32LE(centralStart, 16);
	end.writeUInt16LE(0, 20); // comment length
	chunks.push(end);

	return Buffer.concat(chunks);
}

/**
 * Makes a household name safe as a filename inside the archive.
 *
 * Path separators and `..` are stripped rather than escaped: a name is a label, and an
 * archive entry that could write outside its extraction directory is the classic zip
 * traversal bug.
 */
export function safeEntryName(name: string, extension: string): string {
	const base = name
		// Path separators and the characters Windows refuses in a filename.
		.replace(/[\\/:*?"<>|]+/g, '-')
		// Collapse any run of dots, so no `..` survives the separator pass above.
		.replace(/\.{2,}/g, '.')
		// Trim the punctuation those two passes leave at the ends.
		.replace(/^[-.\s]+|[-.\s]+$/g, '')
		.slice(0, 80);
	return `${base || 'invitation'}.${extension}`;
}
