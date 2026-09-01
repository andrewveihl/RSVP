/**
 * Points the whole deployment at your hostnames.
 *
 *     npm run set-domain <guest-host> [admin-host]
 *
 * e.g.  npm run set-domain rsvp-andrew-madeline.duckdns.org
 *
 * The admin host defaults to `admin-<guest-host>` -- a sibling label rather than a
 * sub-subdomain, because DuckDNS gives out one label and a wildcard certificate would
 * need a DNS-01 challenge.
 *
 * Rewrites every place a hostname is hard-coded:
 *
 *   nginx/conf.d/default.conf   server_name lines and the TLS certificate paths
 *   .env                        PUBLIC_SITE_URL and PUBLIC_ADMIN_URL
 *
 * Idempotent: it reads the hostnames currently in `.env` and replaces those, so
 * running it again with different names works. On a fresh checkout it replaces the
 * `rsvp.example.duckdns.org` placeholders instead.
 *
 * It does NOT touch DNS, obtain certificates, or restart anything -- it prints the
 * commands to run next.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const NGINX_CONF = join(repoRoot, 'nginx', 'conf.d', 'default.conf');
const ENV_FILE = join(repoRoot, '.env');
const ENV_EXAMPLE = join(repoRoot, '.env.example');

const PLACEHOLDER_GUEST = 'rsvp.example.duckdns.org';
const PLACEHOLDER_ADMIN = 'admin-rsvp.example.duckdns.org';

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

/** Reads one KEY=value out of an env file. */
function readEnvValue(/** @type {string} */ text, /** @type {string} */ key) {
	const match = new RegExp(`^${key}=(.*)$`, 'm').exec(text);
	return match ? match[1].trim() : '';
}

/** The hostname inside a URL, or '' if it is unset or unparseable. */
function hostOf(/** @type {string} */ url) {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

function replaceAll(/** @type {string} */ text, /** @type {string} */ from, /** @type {string} */ to) {
	if (!from || from === to) return text;
	return text.split(from).join(to);
}

const [guestHost, adminHostArg] = process.argv.slice(2);
const adminHost = adminHostArg || `admin-${guestHost ?? ''}`;

if (!guestHost) {
	console.error('Usage: npm run set-domain <guest-host> [admin-host]');
	console.error('   e.g. npm run set-domain rsvp-andrew-madeline.duckdns.org');
	process.exit(1);
}

validateHost(guestHost, 'guest host');
validateHost(adminHost, 'admin host');

if (guestHost === adminHost) {
	console.error('The guest and admin hosts must be different -- they are separate apps.');
	process.exit(1);
}

// --- Work out what the files currently say ---------------------------------
const envSource = existsSync(ENV_FILE) ? ENV_FILE : ENV_EXAMPLE;
const envText = readFileSync(envSource, 'utf8');

const currentGuest = hostOf(readEnvValue(envText, 'PUBLIC_SITE_URL')) || PLACEHOLDER_GUEST;
const currentAdmin = hostOf(readEnvValue(envText, 'PUBLIC_ADMIN_URL')) || PLACEHOLDER_ADMIN;

// --- nginx ------------------------------------------------------------------
let nginx = readFileSync(NGINX_CONF, 'utf8');
// Admin first: `admin-rsvp.example…` contains `rsvp.example…` nowhere, but replacing
// the longer name first is the habit that keeps this safe if the scheme ever changes.
nginx = replaceAll(nginx, currentAdmin, adminHost);
nginx = replaceAll(nginx, PLACEHOLDER_ADMIN, adminHost);
nginx = replaceAll(nginx, currentGuest, guestHost);
nginx = replaceAll(nginx, PLACEHOLDER_GUEST, guestHost);
writeFileSync(NGINX_CONF, nginx);

// --- .env -------------------------------------------------------------------
let env = envText;
env = env.replace(/^PUBLIC_SITE_URL=.*$/m, `PUBLIC_SITE_URL=https://${guestHost}`);
env = env.replace(/^PUBLIC_ADMIN_URL=.*$/m, `PUBLIC_ADMIN_URL=https://${adminHost}`);
writeFileSync(ENV_FILE, env);

console.log(`Guest site : https://${guestHost}`);
console.log(`Admin      : https://${adminHost}`);
console.log('');
console.log('Updated nginx/conf.d/default.conf and .env.');
if (envSource === ENV_EXAMPLE) {
	console.log('(.env did not exist, so it was created from .env.example -- fill in the rest.)');
}
console.log('');
console.log('Next:');
console.log(`  1. Point both names at this server in DuckDNS.`);
console.log(`  2. ./scripts/init-letsencrypt.sh ${guestHost} you@example.com`);
console.log(`  3. docker compose up -d`);
