import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHousehold, DATABASE_PATH, HOUSEHOLDS } from './fixtures';

/**
 * The RSVP flow -- the one thing on this site that has to work.
 *
 * Two habits run through this file:
 *
 * - Specs that *change* a reply create their own household. The suite runs against one
 *   database and every project runs every spec, so sharing a mutable fixture would
 *   pass on the first project and fail on the second, and the failure would look like
 *   a mobile-layout bug rather than what it is.
 * - Assertions go to the database, not just the confirmation screen. A screen saying
 *   "thank you" would look identical if nothing had been stored.
 */

interface StoredRsvp {
	attending: number;
	guest_count: number;
	plus_one_count: number;
}

function storedRsvp(token: string): StoredRsvp | undefined {
	const db = new Database(DATABASE_PATH, { readonly: true });
	try {
		return db
			.prepare(
				`SELECT r.attending, r.guest_count, r.plus_one_count
				 FROM rsvps r JOIN households h ON h.id = r.household_id
				 WHERE h.token = ?`
			)
			.get(token) as StoredRsvp | undefined;
	} finally {
		db.close();
	}
}

function countRsvps(token: string): number {
	const db = new Database(DATABASE_PATH, { readonly: true });
	try {
		const row = db
			.prepare(
				'SELECT COUNT(*) AS n FROM rsvps r JOIN households h ON h.id = r.household_id WHERE h.token = ?'
			)
			.get(token) as { n: number };
		return row.n;
	} finally {
		db.close();
	}
}

test('a household accepts, and the reply is stored', async ({ page }) => {
	const household = createHousehold('The Accepting Family');
	await page.goto(`/rsvp/${household.token}`);

	await expect(page.getByText(household.name)).toBeVisible();

	await page.getByText('Joyfully accepts').click();

	// The count is a stepper, so there is no keyboard to open over the button.
	// The household is invited for 3, so stepping up once makes one plus-one.
	await page.getByRole('button', { name: 'One more' }).click();
	await expect(page.locator('[aria-live="polite"]').first()).toHaveText('4');

	await page.getByRole('button', { name: 'Send our reply' }).click();

	await expect(page.getByTestId('rsvp-confirmation')).toContainText('Thank you!');
	// One number in, the split derived against the invited party size of 3.
	expect(storedRsvp(household.token)).toMatchObject({
		attending: 1,
		guest_count: 3,
		plus_one_count: 1
	});
});

test('a household declines, and the counts are zeroed', async ({ page }) => {
	// Starts from an acceptance, so there really are non-zero counts on screen when
	// the household changes its mind -- which is the case worth checking.
	const household = createHousehold('The Declining Family', {
		attending: true,
		guestCount: 4,
		plusOneCount: 2
	});
	await page.goto(`/rsvp/${household.token}`);

	await page.getByText('Regretfully declines').click();
	await page.getByRole('button', { name: /reply/ }).click();

	await expect(page.getByTestId('rsvp-confirmation')).toContainText("We'll miss you!");
	expect(storedRsvp(household.token)).toMatchObject({
		attending: 0,
		guest_count: 0,
		plus_one_count: 0
	});
});

test('a household that already replied sees its answer and can change it', async ({ page }) => {
	const household = createHousehold('The Reconsidering Family', {
		attending: true,
		guestCount: 2,
		plusOneCount: 1
	});
	await page.goto(`/rsvp/${household.token}`);

	await expect(page.getByText('You replied')).toBeVisible();

	// The form starts from the previous answer rather than blank, and shows the guest
	// one total rather than our internal split.
	await expect(page.locator('input[value="yes"]')).toBeChecked();
	await expect(page.locator('[aria-live="polite"]').first()).toHaveText('3');

	await page.getByRole('button', { name: 'One more' }).click();
	await page.getByRole('button', { name: 'Update our reply' }).click();

	await expect(page.getByTestId('rsvp-confirmation')).toContainText('Thank you!');
	// Invited 3, four coming: three of them plus one extra.
	expect(storedRsvp(household.token)).toMatchObject({ guest_count: 3, plus_one_count: 1 });
});

test('updating replaces the reply rather than adding a second one', async ({ page }) => {
	const household = createHousehold('The Switching Family', {
		attending: false,
		guestCount: 0,
		plusOneCount: 0
	});

	await page.goto(`/rsvp/${household.token}`);
	await page.getByText('Joyfully accepts').click();
	await page.getByRole('button', { name: 'Update our reply' }).click();
	await expect(page.getByTestId('rsvp-confirmation')).toBeVisible();

	// A second row would silently double this household in every total.
	expect(countRsvps(household.token)).toBe(1);
});

test('the RSVP form submits without JavaScript', async ({ browser }) => {
	// The form posts to a real form action; `use:enhance` only removes the reload.
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	const household = createHousehold('The Scriptless Family');

	await page.goto(`/rsvp/${household.token}`);
	// The radio is visually hidden and driven by its label, so the label is what a
	// person clicks -- with or without scripts.
	await page.getByText('Joyfully accepts').click();
	// And with no JavaScript the stepper buttons are inert, so the real number input
	// takes their place on screen. That swap is the whole point of keeping one.
	await expect(page.locator('#guestTotal')).toBeVisible();
	await page.locator('#guestTotal').fill('2');
	await page.getByRole('button', { name: /reply/ }).click();

	await expect(page.getByTestId('rsvp-confirmation')).toContainText('Thank you!');
	expect(storedRsvp(household.token)).toMatchObject({ attending: 1, guest_count: 2 });

	await context.close();
});

test('the confirmation offers a calendar file and a way to change the reply', async ({ page }) => {
	const household = createHousehold('The Calendar Family');

	await page.goto(`/rsvp/${household.token}`);
	await page.getByText('Joyfully accepts').click();
	await page.getByRole('button', { name: /reply/ }).click();
	await expect(page.getByTestId('rsvp-confirmation')).toBeVisible();

	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Add to calendar' }).click();
	expect((await download).suggestedFilename()).toBe('wedding.ics');

	await page.getByRole('link', { name: 'Change your reply' }).click();
	await expect(page.locator('input[value="yes"]')).toBeChecked();
});

test('the RSVP pages carry no site navigation', async ({ page }) => {
	const household = createHousehold('The Uncluttered Family');
	await page.goto(`/rsvp/${household.token}`);

	// The nav and footer were a third of a phone viewport on a single-question page.
	await expect(page.locator('nav')).toHaveCount(0);
	await expect(page.locator('main')).toHaveCount(0);

	// And the whole thing fits without scrolling.
	const overflow = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('an unknown token offers the name look-up instead of an error', async ({ page }) => {
	const response = await page.goto('/rsvp/definitely-not-a-real-token-here');

	// Deliberately not a 404: the likely cause is a mistyped URL from a printed card.
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 1 })).toContainText("couldn't find that link");
	await expect(page.getByRole('link', { name: 'Find my invitation' })).toBeVisible();
});

test('a token full of SQL metacharacters is simply not found', async ({ page }) => {
	await page.goto(`/rsvp/${encodeURIComponent("' OR 1=1 --")}`);
	await expect(page.getByRole('heading', { level: 1 })).toContainText("couldn't find that link");
});

test('a guest finds their invitation by name', async ({ page }) => {
	await page.goto('/rsvp');

	await page.getByLabel('Name on the invitation').fill(HOUSEHOLDS.pending.name);
	await page.getByRole('button', { name: 'Find my invitation' }).click();

	// Resolved to the household's own page -- the token appears only in the URL.
	await expect(page).toHaveURL(`/rsvp/${HOUSEHOLDS.pending.token}`);
	await expect(page.getByText(HOUSEHOLDS.pending.name)).toBeVisible();
});

test('an ambiguous name offers a choice, without exposing tokens', async ({ page }) => {
	await page.goto('/rsvp');

	await page.getByLabel('Name on the invitation').fill('Bell');
	await page.getByRole('button', { name: 'Find my invitation' }).click();

	await expect(page.getByText('More than one match')).toBeVisible();

	// Names only: no page in this flow ever renders a token.
	const html = await page.content();
	expect(html).not.toContain(HOUSEHOLDS.ambiguousA.token);
	expect(html).not.toContain(HOUSEHOLDS.ambiguousB.token);

	// Scoped to the disambiguation list, because the type-ahead dropdown above offers
	// buttons with the same names.
	const choices = page.locator('section').last();
	await choices.getByRole('button', { name: HOUSEHOLDS.ambiguousB.name }).click();
	await expect(page).toHaveURL(`/rsvp/${HOUSEHOLDS.ambiguousB.token}`);
});

test('a name that is not on the list gets a friendly message', async ({ page }) => {
	await page.goto('/rsvp');

	await page.getByLabel('Name on the invitation').fill('Somebody Nobody');
	await page.getByRole('button', { name: 'Find my invitation' }).click();

	await expect(page.getByRole('alert')).toContainText("couldn't find");
	await expect(page.getByRole('alert')).toContainText('hello@example.com');
});

test('type-ahead suggests names as you type', async ({ page }) => {
	await page.goto('/rsvp');

	await page.getByLabel('Name on the invitation').fill('Whit');
	await expect(page.getByRole('button', { name: HOUSEHOLDS.pending.name })).toBeVisible();
});

test('the honeypot is filled only by something automated', async ({ page, request }) => {
	const household = createHousehold('The Honeypot Family');

	// Load the page first, for a CSRF cookie and a token that match each other.
	await page.goto(`/rsvp/${household.token}`);
	const csrf = await page.locator('input[name="csrf_token"]').inputValue();
	const cookies = await page.context().cookies();
	const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');

	const response = await request.post(`/rsvp/${household.token}`, {
		headers: {
			origin: 'http://127.0.0.1:4273',
			cookie: cookieHeader,
			'content-type': 'application/x-www-form-urlencoded'
		},
		form: {
			csrf_token: csrf,
			attending: 'yes',
			guestTotal: '2',
			// The hidden field a real browser never fills in.
			website: 'http://spam.example'
		}
	});

	// Answered as though it worked, so a bot has nothing to tune against...
	expect(response.status()).toBe(200);
	// ...but nothing was written.
	expect(storedRsvp(household.token)).toBeUndefined();
});

test('a submission without a CSRF token is rejected', async ({ request }) => {
	const household = createHousehold('The Tokenless Family');

	const response = await request.post(`/rsvp/${household.token}`, {
		// `Accept: text/html` makes SvelteKit answer like a browser form post, so the
		// rejection shows up as the response status rather than inside a JSON envelope.
		headers: { origin: 'http://127.0.0.1:4273', accept: 'text/html' },
		form: { attending: 'yes', guestTotal: '2' }
	});

	expect(response.status()).toBe(403);
	expect(storedRsvp(household.token)).toBeUndefined();
});

test('a cross-origin submission is rejected', async ({ page, request }) => {
	const household = createHousehold('The Cross-Origin Family');

	await page.goto(`/rsvp/${household.token}`);
	const csrf = await page.locator('input[name="csrf_token"]').inputValue();
	const cookies = await page.context().cookies();

	const response = await request.post(`/rsvp/${household.token}`, {
		headers: {
			origin: 'https://evil.example',
			accept: 'text/html',
			cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
		},
		form: { csrf_token: csrf, attending: 'yes', guestTotal: '2' }
	});

	expect(response.status()).toBe(403);
	expect(storedRsvp(household.token)).toBeUndefined();
});
