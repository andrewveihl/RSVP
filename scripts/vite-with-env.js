/**
 * Starts Vite with the repo's `.env` already loaded into `process.env`.
 *
 * Two problems this solves:
 *
 * 1. Vite reads `.env` for its own config, but never puts the values on `process.env` --
 *    and `shared/src/config.ts` reads `process.env`, because that is what the container
 *    provides in production. Node's `--env-file-if-exists` bridges the gap, and running
 *    Vite from inside a Node process is the only way to combine the two.
 *
 * 2. npm workspaces hoist `vite` to the repo-root `node_modules`, so a hardcoded
 *    `./node_modules/vite/bin/vite.js` does not exist inside `app/` or `admin/`. Vite's
 *    JS API is used rather than its CLI because the bin script is not an exported
 *    subpath, so it cannot be resolved by path at all.
 *
 * Usage (from an app directory):
 *     node --env-file-if-exists=../.env ../scripts/vite-with-env.js dev
 *     node --env-file-if-exists=../.env ../scripts/vite-with-env.js preview
 *
 * `--port` and `--host` are forwarded, so a port clash can be stepped around without
 * editing the config:
 *
 *     npm run dev -w app -- --port 5175
 *
 * That is worth having because 5173 and 5174 are Vite's own defaults, so any other
 * SvelteKit project running at the same time is already sitting on them.
 *
 * Development only. In production the built server runs directly under
 * `node build/index.js`, with environment variables supplied by Docker.
 */
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

/**
 * Re-anchors relative file paths in `.env` to the repo root.
 *
 * `.env` is shared by both apps but each dev server starts inside its own workspace,
 * so a relative `DATABASE_PATH=./data/dev.db` would mean `app/data/dev.db` for one and
 * `admin/data/dev.db` for the other -- two empty databases, and two apps that appear to
 * work while silently disagreeing about every guest.
 *
 * Production is unaffected: the container paths are absolute, and this script does not
 * run there.
 */
function anchorPaths() {
	const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

	for (const key of ['DATABASE_PATH', 'BACKUP_DIR']) {
		const value = process.env[key];
		if (value && !isAbsolute(value)) process.env[key] = resolve(repoRoot, value);
	}
}

anchorPaths();

const args = process.argv.slice(2);
const command = args[0] === 'preview' ? 'preview' : 'dev';

/** Reads `--flag value` out of the arguments, or undefined if it is absent. */
function flag(name) {
	const index = args.indexOf(`--${name}`);
	return index === -1 ? undefined : args[index + 1];
}

const mode = flag('mode');
const port = Number.parseInt(flag('port') ?? '', 10);
const host = flag('host');

// Only the keys actually supplied are set, so an absent flag leaves the config's own
// value alone rather than overwriting it with undefined.
const overrides = {
	...(Number.isFinite(port) ? { port } : {}),
	...(host ? { host } : {})
};

try {
	const config = {
		mode,
		// `preview` and `dev` read their address from different config sections.
		...(command === 'preview' ? { preview: overrides } : { server: overrides })
	};

	const server = command === 'preview' ? await preview(config) : await createServer(config);

	// `preview` starts listening on creation; the dev server does not.
	if (command === 'dev') await server.listen();

	server.printUrls();
} catch (error) {
	console.error(`Failed to start Vite: ${error.message}`);
	process.exit(1);
}
