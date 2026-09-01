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
