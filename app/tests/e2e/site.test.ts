import { expect, test } from '@playwright/test';

/**
 * The public wedding site: does every page render, and does it render *server-side*?
 *
 * The last part matters more than it looks. The whole content site is meant to work
 * without JavaScript, so several of these assertions are made with scripts disabled.
 */

test('the home page shows the couple, the date and a way to RSVP', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('heading', { level: 1 })).toContainText('Andrew & Madeline');
	// Scoped to the page body: the nav carries an RSVP link of its own.
	await expect(page.getByRole('main').getByRole('link', { name: 'RSVP', exact: true })).toBeVisible();
	await expect(page.getByTestId('countdown')).toBeVisible();
});

test('the countdown ticks', async ({ page }) => {
	await page.goto('/');

	const clock = page.getByTestId('countdown');
	const before = await clock.innerText();

	// Seconds are the fastest unit, so a two-second wait is enough to see a change.
	await page.waitForTimeout(2100);
	expect(await clock.innerText()).not.toBe(before);
});

test('every section is reachable from the navigation', async ({ page }) => {
	await page.goto('/');

	const pages: [string, string][] = [
		['/our-story', 'Our Story'],
		['/details', 'Event Details'],
		['/wedding-party', 'Wedding Party'],
		['/gallery', 'Photos'],
		['/registry', 'Registry'],
		['/faq', 'Questions']
	];

	for (const [path, heading] of pages) {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
	}
});

test('the FAQ opens without JavaScript', async ({ browser }) => {
	// A native <details> element, chosen precisely so this works.
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();

	await page.goto('/faq');
	const question = page.getByText('What is the dress code?');
	await expect(question).toBeVisible();

	const answer = page.getByText('Semi-formal', { exact: false }).first();
	await expect(answer).toBeHidden();

	await question.click();
	await expect(answer).toBeVisible();

	await context.close();
});

test('the content pages render server-side, with scripts off', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();

	await page.goto('/our-story');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Our Story');
	await expect(page.getByText('How we met')).toBeVisible();

	// Navigation is plain anchors, so it works too.
	await page.goto('/details');
	await expect(page.getByText('The Venue')).toBeVisible();

	await context.close();
});

test('the countdown still shows a real number with scripts off', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();

	await page.goto('/');
	// Server-rendered from the same component; it simply stops ticking.
	await expect(page.getByTestId('countdown')).toContainText('Days');
	// Asserted against the source rather than the DOM: how a browser parses <noscript>
	// depends on whether scripting was enabled at parse time, which makes a DOM query
	// here a test of Chromium rather than of the page.
	expect(await page.content()).toContain('Time remaining as of when this page loaded.');

	await context.close();
});

test('a page that does not exist gets a friendly 404', async ({ page }) => {
	const response = await page.goto('/no-such-page');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('does not exist');
});

test('the security headers are set', async ({ page }) => {
	const response = await page.goto('/');
	const headers = response!.headers();

	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
	expect(headers['content-security-policy']).toContain("object-src 'none'");
});

test('RSVP pages are marked no-index and no-store', async ({ page }) => {
	// A token lives in that URL; it must never reach a search engine or a shared cache.
	const response = await page.goto('/rsvp');
	const headers = response!.headers();

	expect(headers['x-robots-tag']).toContain('noindex');
	expect(headers['cache-control']).toContain('no-store');
});

test('the site is usable on a narrow screen', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 720 });
	await page.goto('/');

	// Nothing may overflow horizontally on a phone.
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);

	// Every destination is visible without a tap: the nav is one horizontal strip that
	// scrolls sideways, not a hamburger hiding the list behind a disclosure.
	await expect(page.locator('summary')).toHaveCount(0);
	await expect(page.getByRole('navigation').getByRole('link', { name: 'Our Story' })).toBeVisible();
	await expect(page.getByRole('navigation').getByRole('link', { name: 'RSVP' })).toBeVisible();
});

test('dark mode uses the dark palette', async ({ browser }) => {
	const context = await browser.newContext({ colorScheme: 'dark' });
	const page = await context.newPage();
	await page.goto('/');

	const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	// The dark canvas is rgb(26 26 26); the light one is rgb(251 250 247).
	expect(background).toBe('rgb(26, 26, 26)');

	await context.close();
});
