/**
 * CRC-32 (IEEE 802.3), which the ZIP format requires for every entry.
 *
 * The table is built once on first use rather than written out as 256 literals -- it
 * is derived from the polynomial, so generating it is both shorter and impossible to
 * get subtly wrong by mistyping a constant.
 */

const POLYNOMIAL = 0xedb88320;

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
	if (table) return table;

	const next = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? (value >>> 1) ^ POLYNOMIAL : value >>> 1;
		}
		next[index] = value >>> 0;
	}

	table = next;
	return table;
}

export function crc32(data: Uint8Array): number {
	const lookup = crcTable();
	let crc = 0xffffffff;

	for (let index = 0; index < data.length; index += 1) {
		crc = (crc >>> 8) ^ lookup[(crc ^ data[index]) & 0xff];
	}

	// `>>> 0` because JavaScript's bitwise operators produce signed 32-bit integers,
	// and the ZIP header field is unsigned.
	return (crc ^ 0xffffffff) >>> 0;
}
