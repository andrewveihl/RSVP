import { expect, test } from '@playwright/test';

/**
 * Getting in, and being kept out.
 *
 * The rate limit itself lives in rate-limit.test.ts, which starts a server configured
 * with the production budget -- the shared server here has a generous one, because
 * successful logins spend the same allowance and nearly every spec signs in.
 */

export const PASSWORD = 'e2e-admin-password';

test.describe.configure({ mode: 'serial' });

test('the wrong password is refused', async ({ page }) => {
	await page.goto('/');

	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByTestId('login-error')).toContainText('Incorrect password');
	// Still on the login page. The URL keeps SvelteKit's `?/login` action suffix after
	// a non-enhanced post, so the assertion is about what is on screen, not the path.
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('the right password gets in', async ({ page }) => {
	await page.goto('/');

	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL('/dashboard');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
});

test('an unauthenticated visitor is sent back to the login, and returned afterwards', async ({
	page
}) => {
	await page.goto('/guests');

	// Bounced to the login, with where they were going remembered.
	await expect(page).toHaveURL(/\/\?redirectTo=%2Fguests/);

	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL('/guests');
});

test('a redirect cannot be pointed off-site', async ({ page }) => {
	// A protocol-relative URL the browser would happily follow away from here.
	await page.goto('/?redirectTo=//evil.example');

	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL('/dashboard');
});

test('logging out ends the session', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/dashboard');

	await page.getByTestId('admin-logout').click();
	await expect(page).toHaveURL('/');

	// The session really is gone, not just the page.
	await page.goto('/guests');
	await expect(page).toHaveURL(/redirectTo/);
});

test('the admin app asks not to be indexed', async ({ page }) => {
	const response = await page.goto('/');

	// Belt and braces: the meta tag in the document, and the header from nginx in
	// production. The tag is what this app controls.
	expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
	expect(response!.headers()['cache-control']).toContain('no-store');
});
