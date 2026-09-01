/**
 * Shrinks chosen images in the browser, before they are uploaded.
 *
 * A photo straight off a phone is routinely 4000px wide and several megabytes, and the
 * server caps uploads at 8MB. Without this the couple would pick a picture they like,
 * wait for it to upload, and be told no -- with no obvious way to fix it that does not
 * involve finding an image editor.
 *
 * The site never displays anything wider than about 1600px, so the detail being
 * discarded was never going to be seen. Re-encoding also strips EXIF, which quietly
 * removes the GPS coordinates of wherever the photo was taken.
 *
 * Applied as an action on a `<input type="file">`, so every upload in the content
 * editor gets the same treatment from one implementation:
 *
 *     <input type="file" accept="image/*" use:downscale />
 */
import type { Action } from 'svelte/action';

export interface DownscaleOptions {
	/** Longest edge, in pixels, after scaling. */
	maxEdge?: number;
	/** JPEG quality, 0-1. 0.85 is the usual point of diminishing returns. */
	quality?: number;
	/** Files at or under this size are passed through untouched. */
	skipUnderBytes?: number;
}

const DEFAULTS: Required<DownscaleOptions> = {
	maxEdge: 2000,
	quality: 0.85,
	skipUnderBytes: 600 * 1024
};

async function shrink(file: File, options: Required<DownscaleOptions>): Promise<File> {
	// Small files, and formats a canvas would damage rather than help, are left alone.
	if (file.size <= options.skipUnderBytes) return file;
	if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height));

	// Already small enough in pixels: re-encoding would only lose quality.
	if (scale === 1) {
		bitmap.close();
		return file;
	}

	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);

	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close();
		return file;
	}

	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', options.quality)
	);
	if (!blob || blob.size >= file.size) return file;

	const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
	return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

export const downscale: Action<HTMLInputElement, DownscaleOptions | undefined> = (
	node,
	options
) => {
	const settings = { ...DEFAULTS, ...options };
	// Guards against re-entering on the change event this handler itself causes.
	let rewriting = false;

	const onChange = async () => {
		if (rewriting || !node.files || node.files.length === 0) return;

		const originals = [...node.files];
		let shrunk: File[];

		try {
			shrunk = await Promise.all(originals.map((file) => shrink(file, settings)));
		} catch {
			// An image the browser cannot decode is left exactly as chosen; the server
			// will reject it with a message that says why.
			return;
		}

		if (shrunk.every((file, index) => file === originals[index])) return;

		// A DataTransfer is the only way to put files back into a file input, which is
		// what makes the ordinary form submission carry the smaller versions.
		const transfer = new DataTransfer();
		for (const file of shrunk) transfer.items.add(file);

		rewriting = true;
		node.files = transfer.files;
		rewriting = false;
	};

	node.addEventListener('change', onChange);

	return {
		destroy() {
			node.removeEventListener('change', onChange);
		}
	};
};
