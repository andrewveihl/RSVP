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
 * It shrinks to a *byte budget* rather than to a pixel size and hoping. Which one it
 * is matters: an upload crosses our own limit, adapter-node's `BODY_SIZE_LIMIT` and
 * whatever the reverse proxy allows, and only the first of those produces an error
 * message anybody can read. Guaranteeing the size here means an upload does not depend
 * on how the deployment in front of it happens to be configured.
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
	/** JPEG quality to try first. 0.85 is the usual point of diminishing returns. */
	quality?: number;
	/**
	 * The size to get under, in bytes.
	 *
	 * A *budget*, not a threshold to skip below -- which is the distinction this got
	 * wrong before. It used to pass anything under 600KB through untouched, while the
	 * server refused anything over 512KB, so every photo that landed between the two
	 * was deliberately left alone and then rejected with a bare 413. A photo already
	 * under `maxEdge` was passed through at any size for the same reason, so a 3MB
	 * 1800px PNG failed too. Both of those are why some photos uploaded and others
	 * did not, with nothing on screen to say why.
	 */
	maxBytes?: number;
}

const DEFAULTS: Required<DownscaleOptions> = {
	maxEdge: 2000,
	quality: 0.85,
	// Comfortably inside every limit in the chain -- ours, adapter-node's, and the
	// 1MB a reverse proxy is likely to impose by default -- so an upload does not
	// depend on how the deployment happens to be configured.
	maxBytes: 900 * 1024
};

/** Encodes the canvas and hands back the bytes, or null if the browser refuses. */
function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function shrink(file: File, options: Required<DownscaleOptions>): Promise<File> {
	// A canvas cannot help these: it would flatten a GIF's animation, and anything
	// that is not an image has no business being re-encoded as one.
	if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

	// Already small enough, and no re-encode can improve on that.
	if (file.size <= options.maxBytes) return file;

	const bitmap = await createImageBitmap(file);

	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close();
		return file;
	}

	let scale = Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height));
	let best: Blob | null = null;

	// Quality first, then dimensions. Dropping quality is nearly free at these sizes;
	// dropping pixels is what actually costs detail, so it is the later resort. Six
	// passes takes the worst case from a 50MP phone photo to well under the budget.
	for (let attempt = 0; attempt < 6; attempt += 1) {
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		const quality = Math.max(0.5, options.quality - attempt * 0.1);
		const blob = await encode(canvas, quality);
		if (!blob) break;

		best = blob;
		if (blob.size <= options.maxBytes) break;

		// Still too big: give up a fifth of the width and go again.
		scale *= 0.8;
	}

	bitmap.close();

	// If the original was somehow smaller than anything we produced, keep it.
	if (!best || best.size >= file.size) return file;

	const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
	return new File([best], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
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
