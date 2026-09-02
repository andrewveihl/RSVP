import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * The login rate limit, against a server configured with the production budget.
 *
 * It needs its own server because *successful* logins spend the same budget, and
 * nearly every other spec signs in -- so the shared server is deliberately given a
 * generous allowance. Asserting the real limit therefore means starting a real server
 * with the real number.
 */
const PORT = 4276;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-admin-password';

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
			BACKUP_DIR: './.e2e-data/backups',
			ADMIN_PASSWORD: PASSWORD,
			PUBLIC_ADMIN_URL: BASE,
			// The production figures.
			ADMIN_LOGIN_RATE_LIMIT_MAX: '5',
			ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS: '900000',
			LOG_LEVEL: 'error',
			TZ: 'UTC'
		},
		stdio: 'ignore'
	});

	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(BASE);
			if (response.ok) return;
		} catch {
			// Not listening yet.
		}
		await delay(250);
	}
	throw new Error('The rate-limited server did not start.');
});

test.afterAll(() => {
	server?.kill();
});

test('the sixth wrong password in a window is refused outright', async ({ page }) => {
	await page.goto(BASE);

	for (let attempt = 0; attempt < 5; attempt += 1) {
		await page.getByLabel('Password').fill(`wrong-${attempt}`);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByTestId('login-error')).toContainText('Incorrect password');
	}

	await page.getByLabel('Password').fill('wrong-again');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByTestId('login-error')).toContainText('Too many attempts');
});

test('the right password is refused too, once the budget is spent', async ({ page }) => {
	// The budget is per IP, not per password: guessing cannot be masked by getting it
	// right on the last attempt.
	await page.goto(BASE);

	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	// Refused, and still on the login page -- the URL keeps SvelteKit's `?/login`
	// action suffix after a non-enhanced post, so the assertion is about what is shown.
	await expect(page.getByTestId('login-error')).toContainText('Too many attempts');
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

/**
 * The budget used to be trivially bypassable.
 *
 * nginx *appends* the connecting address to whatever X-Forwarded-For the client sent,
 * and the app read the left-most entry -- so a fresh invented address on each request
 * bought a fresh five attempts, and the cap meant nothing. This spends the budget
 * entirely through spoofed headers: all of them have to land in one bucket.
 *
 * It gets its own server because the specs above have already spent the shared one.
 */
const SPOOF_PORT = 4277;
const SPOOF_BASE = `http://127.0.0.1:${SPOOF_PORT}`;

let spoofServer: ChildProcess;

test.beforeAll(async () => {
	spoofServer = spawn('node', ['build/index.js'], {
		env: {
			...process.env,
			PORT: String(SPOOF_PORT),
			HOST: '127.0.0.1',
			ORIGIN: SPOOF_BASE,
			NODE_ENV: 'production',
			DATABASE_PATH: './.e2e-data/wedding.db',
			BACKUP_DIR: './.e2e-data/backups',
			ADMIN_PASSWORD: PASSWORD,
			PUBLIC_ADMIN_URL: SPOOF_BASE,
			ADMIN_LOGIN_RATE_LIMIT_MAX: '5',
			ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS: '900000',
			// One proxy, as in production -- so the last X-Forwarded-For entry is the
			// only one that counts, and here that is 127.0.0.1 for every request.
			TRUSTED_PROXY_HOPS: '1',
			LOG_LEVEL: 'error',
			TZ: 'UTC'
		},
		stdio: 'ignore'
	});

	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(SPOOF_BASE);
			if (response.ok) return;
		} catch {
			// Not listening yet.
		}
		await delay(250);
	}
	throw new Error('The spoofing test server did not start.');
});

test.afterAll(() => {
	spoofServer?.kill();
});

test('a forged X-Forwarded-For cannot buy a fresh login budget', async ({ request }) => {
	const attempt = async (claimedIp: string, password: string) => {
		const response = await request.post(`${SPOOF_BASE}/?/login`, {
			headers: {
				origin: SPOOF_BASE,
				// Exactly what nginx forwards under `$proxy_add_x_forwarded_for`: the
				// header the attacker sent, with the address it actually connected from
				// appended. Only that last entry is worth anything, and it does not
				// change however the attacker decorates the rest.
				'x-forwarded-for': `${claimedIp}, 127.0.0.1`
			},
			form: { password }
		});
		return JSON.parse(await response.text()).status;
	};

	// Five wrong guesses, each claiming to be someone new.
	for (let index = 1; index <= 5; index += 1) {
		expect(await attempt(`203.0.113.${index}`, 'wrong')).toBe(401);
	}

	// The sixth is refused, so all five landed in the same bucket.
	expect(await attempt('203.0.113.99', 'wrong')).toBe(429);

	// And the right password is refused too, exactly as it is for an honest client --
	// guessing cannot be laundered through a forged header.
	expect(await attempt('203.0.113.123', PASSWORD)).toBe(429);
});
