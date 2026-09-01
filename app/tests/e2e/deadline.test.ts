import { expect, test } from '@playwright/test';

/**
 * The soft deadline.
 *
 * This spec needs a server whose RSVP_DEADLINE has passed, and the shared one is
 * deliberately configured wide open so every other spec can submit. Rather than add a
 * second webServer to the config for one case, it starts its own on a spare port.
 *
 * "Soft" is the important half: a guest is turned away, but the admin can still record
 * a reply for them. That second half is covered in the admin suite, where the admin
 * exists.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 4275;
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess;

test.beforeAll(async () => {
	server = spawn('node', ['build/index.js'], {
		env: {
			...process.env,
			PORT: String(PORT),
			HOST: '127.0.0.1',
			ORIGIN: BASE,
			NODE_ENV: 'production',
			DATABASE_PATH: './.e2e-data/wedding.db',
			PUBLIC_SITE_URL: BASE,
			// The whole point: a deadline in the past.
			RSVP_DEADLINE: '2020-01-01',
			WEDDING_DATE: '2099-12-31',
			CONTACT_EMAIL: 'hello@example.com',
			COUPLE_NAMES: 'Andrew & Madeline',
			LOG_LEVEL: 'error',
			TZ: 'UTC'
		},
		stdio: 'ignore'
	});

	// Poll rather than sleep a fixed amount: a cold start varies more than a guess.
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(BASE);
			if (response.ok) return;
		} catch {
			// Not listening yet.
		}
		await delay(250);
	}
	throw new Error('The closed-deadline server did not start.');
});

test.afterAll(() => {
	server?.kill();
});

test('a guest is told the deadline has passed, and the form is gone', async ({ page }) => {
	const { HOUSEHOLDS } = await import('./fixtures');
	await page.goto(`${BASE}/rsvp/${HOUSEHOLDS.pending.token}`);

	await expect(page.getByTestId('rsvp-closed')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('The deadline has passed');
	// Given a way to reach the couple rather than just a dead end.
	await expect(page.getByRole('link', { name: /Email/ })).toBeVisible();
	await expect(page.getByLabel('Joyfully accepts')).toHaveCount(0);
});

test('a submission after the deadline is refused', async ({ request }) => {
	const { HOUSEHOLDS } = await import('./fixtures');

	// Fetch the page for a CSRF pair first, so the refusal is the deadline's doing and
	// not the CSRF check's.
	const pageResponse = await request.get(`${BASE}/rsvp/${HOUSEHOLDS.pending.token}`);
	const html = await pageResponse.text();
	const csrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1] ?? '';
	const cookie = (pageResponse.headers()['set-cookie'] ?? '').split(';')[0];

	const response = await request.post(`${BASE}/rsvp/${HOUSEHOLDS.pending.token}`, {
		headers: { origin: BASE, accept: 'text/html', cookie },
		form: { csrf_token: csrf, attending: 'yes', guestCount: '2' }
	});

	expect(response.status()).toBe(403);
});
