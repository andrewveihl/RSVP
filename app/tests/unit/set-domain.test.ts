import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// A plain .js deployment script, deliberately outside the app build.
import { currentHosts, rewriteEnv, rewriteNginx } from '../../../scripts/set-domain.js';

/**
 * `npm run set-domain` re-points the deployment at a pair of hostnames.
 *
 * It is tested because it has failed silently twice: it used to read the *current*
 * hostnames from `.env`, which holds localhost during development, so it would report
 * success having rewritten nothing. Getting this wrong means nginx serves a name the
 * certificate does not cover, which is only discovered in a browser.
 */

const NGINX = readFileSync(
	new URL('../../../nginx/conf.d/default.conf', import.meta.url),
	'utf8'
);

const REAL = {
	guest: 'andrew-madeline-rsvp.duckdns.org',
	admin: 'andrew-madeline-rsvp-admin.duckdns.org'
};

describe('currentHosts', () => {
	it('reads both names off the HTTP block, which is the only line listing the pair', () => {
		expect(currentHosts(NGINX)).toEqual(REAL);
	});

	it('reports nothing rather than guessing when no pair is present', () => {
		expect(currentHosts('server {\n\tserver_name only-one.example.org;\n}')).toEqual({
			guest: '',
			admin: ''
		});
	});
});

describe('rewriteNginx', () => {
	const hosts = { guest: 'a.example.org', admin: 'b.example.org' };
	const rewritten = rewriteNginx(NGINX, hosts);

	it('replaces every occurrence of the old names', () => {
		expect(rewritten).not.toContain(REAL.guest);
		expect(rewritten).not.toContain(REAL.admin);
	});

	it('serves both names over HTTP and one each over HTTPS', () => {
		expect(rewritten).toContain('server_name a.example.org b.example.org;');
		expect(rewritten).toContain('server_name a.example.org;');
		expect(rewritten).toContain('server_name b.example.org;');
	});

	it('points the certificate paths at the primary domain, which covers both', () => {
		expect(rewritten).toContain('/etc/letsencrypt/live/a.example.org/fullchain.pem');
		expect(rewritten).not.toContain('/etc/letsencrypt/live/b.example.org/');
	});

	it('is idempotent, so re-running after a change is safe', () => {
		expect(rewriteNginx(rewritten, hosts)).toBe(rewritten);
	});

	it('survives the nesting of the default admin-<guest> naming scheme', () => {
		// The trap: the guest name is a substring of the admin name, and after the admin
		// name is replaced the *new* one contains the *old* guest name. A single-pass
		// replace in either order corrupts one of them.
		const nested = { guest: 'rsvp.example.duckdns.org', admin: 'admin-rsvp.example.duckdns.org' };

		const there = rewriteNginx(NGINX, nested);
		expect(there).toContain(`server_name ${nested.guest} ${nested.admin};`);
		expect(there).toContain(`server_name ${nested.admin};`);

		// And back again, unchanged.
		expect(rewriteNginx(there, REAL)).toBe(NGINX);
	});
});

describe('rewriteEnv', () => {
	it('rewrites the live URLs on a production .env', () => {
		const env = [
			'ADMIN_PASSWORD=secret',
			'PUBLIC_SITE_URL=https://old-guest.example.org',
			'PUBLIC_ADMIN_URL=https://old-admin.example.org'
		].join('\n');

		expect(rewriteEnv(env, REAL)).toBe(
			[
				'ADMIN_PASSWORD=secret',
				`PUBLIC_SITE_URL=https://${REAL.guest}`,
				`PUBLIC_ADMIN_URL=https://${REAL.admin}`
			].join('\n')
		);
	});

	it('leaves a localhost .env on localhost, updating the commented production pair', () => {
		// Overwriting these would break `npm run dev` -- they are what the CSRF origin
		// check compares against -- so the new names go into the comments instead.
		const env = [
			'PUBLIC_SITE_URL=http://localhost:5175',
			'PUBLIC_ADMIN_URL=http://localhost:5176',
			'',
			'#PUBLIC_SITE_URL=https://stale-guest.example.org',
			'#PUBLIC_ADMIN_URL=https://stale-admin.example.org'
		].join('\n');

		expect(rewriteEnv(env, REAL)).toBe(
			[
				'PUBLIC_SITE_URL=http://localhost:5175',
				'PUBLIC_ADMIN_URL=http://localhost:5176',
				'',
				`#PUBLIC_SITE_URL=https://${REAL.guest}`,
				`#PUBLIC_ADMIN_URL=https://${REAL.admin}`
			].join('\n')
		);
	});
});
