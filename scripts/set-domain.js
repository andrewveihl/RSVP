/**
 * Points the deployment at your hostnames.
 *
 *     npm run set-domain <guest-host> [admin-host]
 *
 * e.g.  npm run set-domain andrew-madeline-rsvp.duckdns.org andrew-madeline-rsvp-admin.duckdns.org
 *
 * The admin host defaults to `admin-<guest-host>`, but pass your own -- on DuckDNS each
 * domain is a single label, so the admin name is a *second domain registered in the same
 * account*, and it can be named anything.
 *
 * Rewrites the two places a hostname is recorded:
 *
 *   nginx/conf.d/default.conf   server_name lines and the TLS certificate paths
 *   .env                        PUBLIC_SITE_URL and PUBLIC_ADMIN_URL
 *
 * The *current* names are read from the nginx config rather than from `.env`, which is
 * what makes re-running safe. That distinction matters: `.env` legitimately holds
 * localhost during development, and an earlier version read the names from there, so
 * once the two diverged it silently rewrote nothing while reporting success.
 *
 * It does NOT touch DNS, obtain certificates, or restart anything -- it prints the
 * commands to run next.
 *
 * The rewriting functions are exported for tests; the CLI below runs only when this file
 * is executed directly.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const NGINX_CONF = join(repoRoot, 'nginx', 'conf.d', 'default.conf');
const ENV_FILE = join(repoRoot, '.env');
const ENV_EXAMPLE = join(repoRoot, '.env.example');

/**
 * The hostnames an nginx config is currently serving.
 *
 * Read from the first `server_name` that lists two names -- the HTTP block, which is
 * where both appear together. The HTTPS blocks name one each, and the certificate paths
 * only ever name the primary.
 */
export function currentHosts(/** @type {string} */ nginx) {
	for (const line of nginx.split('\n')) {
		const match = /^\s*server_name\s+(.+);/.exec(line);
		if (!match) continue;

		const names = match[1].trim().split(/\s+/);
		if (names.length >= 2) return { guest: names[0], admin: names[1] };
	}
	return { guest: '', admin: '' };
}

function replaceAll(/** @type {string} */ text, /** @type {string} */ from, /** @type {string} */ to) {
	if (!from || from === to) return text;
	return text.split(from).join(to);
}

/**
 * Swaps both hostnames throughout an nginx config -- server_name lines, certificate
 * paths and the comments at the top.
 *
 * Via a sentinel, because these names nest in both directions. The default scheme makes
 * the guest name a substring of the admin one (`admin-<guest>`), so the admin has to be
 * replaced first -- but the *new* admin name then contains the *old* guest name, and a
 * naive second pass would mangle what the first just wrote. Parking it out of the way
 * avoids both collisions.
 */
export function rewriteNginx(/** @type {string} */ nginx, /** @type {{guest: string, admin: string}} */ hosts) {
	const previous = currentHosts(nginx);
	const SENTINEL = '{{ADMIN_HOST}}'; // braces are legal nowhere in a hostname

	let out = replaceAll(nginx, previous.admin, SENTINEL);
	out = replaceAll(out, previous.guest, hosts.guest);
	return replaceAll(out, SENTINEL, hosts.admin);
}

/**
 * Points `.env`'s two public URLs at the new hostnames.
 *
 * A `.env` on localhost is left pointed there. Those two URLs are what the CSRF origin
 * check compares against, so overwriting them would break `npm run dev` every time this
 * ran. The production pair is written alongside as comments instead, ready to swap in on
 * the server.
 */
export function rewriteEnv(/** @type {string} */ env, /** @type {{guest: string, admin: string}} */ hosts) {
	if (/^PUBLIC_SITE_URL=https?:\/\/(localhost|127\.0\.0\.1)/m.test(env)) {
		return env
			.replace(/^#?PUBLIC_SITE_URL=https:\/\/\S*$/m, `#PUBLIC_SITE_URL=https://${hosts.guest}`)
			.replace(/^#?PUBLIC_ADMIN_URL=https:\/\/\S*$/m, `#PUBLIC_ADMIN_URL=https://${hosts.admin}`);
	}

	return env
		.replace(/^PUBLIC_SITE_URL=.*$/m, `PUBLIC_SITE_URL=https://${hosts.guest}`)
		.replace(/^PUBLIC_ADMIN_URL=.*$/m, `PUBLIC_ADMIN_URL=https://${hosts.admin}`);
}

/** A hostname, not a URL and not an IP -- those cannot hold a public certificate. */
function validateHost(/** @type {string} */ host, /** @type {string} */ label) {
	if (!host) {
		console.error(`Missing ${label}.`);
		process.exit(1);
	}
	if (host.includes('://') || host.includes('/')) {
		console.error(`${label} must be a bare hostname, not a URL: ${host}`);
		process.exit(1);
	}
	if (/^[0-9.]+$/.test(host)) {
		console.error(
			`${label} is an IP address (${host}).\n` +
				'Certificate authorities issue for names, not IPs, so guests would still see a\n' +
				'security warning. Register a hostname and point it at this IP instead.'
		);
		process.exit(1);
	}
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) {
		console.error(`${label} does not look like a hostname: ${host}`);
		process.exit(1);
	}
}

function main() {
	const [guestHost, adminHostArg] = process.argv.slice(2);
	const adminHost = adminHostArg || `admin-${guestHost ?? ''}`;

	if (!guestHost) {
		console.error('Usage: npm run set-domain <guest-host> [admin-host]');
		console.error(
			'   e.g. npm run set-domain andrew-madeline-rsvp.duckdns.org andrew-madeline-rsvp-admin.duckdns.org'
		);
		process.exit(1);
	}

	validateHost(guestHost, 'guest host');
	validateHost(adminHost, 'admin host');

	if (guestHost === adminHost) {
		console.error('The guest and admin hosts must be different -- they are separate apps.');
		process.exit(1);
	}

	const hosts = { guest: guestHost, admin: adminHost };

	const nginx = readFileSync(NGINX_CONF, 'utf8');
	if (!currentHosts(nginx).guest) {
		console.error(`Could not find a server_name pair in ${NGINX_CONF}.`);
		console.error('Has the file been edited by hand? Restore it from git and re-run.');
		process.exit(1);
	}
	writeFileSync(NGINX_CONF, rewriteNginx(nginx, hosts));

	const envSource = existsSync(ENV_FILE) ? ENV_FILE : ENV_EXAMPLE;
	const env = readFileSync(envSource, 'utf8');
	const isLocal = /^PUBLIC_SITE_URL=https?:\/\/(localhost|127\.0\.0\.1)/m.test(env);
	writeFileSync(ENV_FILE, rewriteEnv(env, hosts));

	console.log(`Guest site : https://${guestHost}`);
	console.log(`Admin      : https://${adminHost}`);
	console.log('');
	console.log('Updated nginx/conf.d/default.conf.');

	if (isLocal) {
		console.log('');
		console.log('.env is pointed at localhost, so its live URLs were left alone -- development');
		console.log('would break otherwise. The production pair is written just below them,');
		console.log('commented out, ready to swap in on the server.');
	} else if (envSource === ENV_EXAMPLE) {
		console.log('(.env did not exist, so it was created from .env.example -- fill in the rest.)');
	}

	console.log('');
	console.log('Next:');
	console.log('  1. Point both names at this server in DuckDNS. Each DuckDNS domain is one');
	console.log('     label, so these are two domains in one account, not a subdomain.');
	console.log(`  2. ./scripts/init-letsencrypt.sh ${guestHost} you@example.com`);
	console.log('  3. docker compose up -d');
}

// Only when run as a command, so tests can import the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
