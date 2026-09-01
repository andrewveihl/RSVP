import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { DATABASE_PATH, SEEDED } from './global-setup';

/**
 * The admin dashboard, signed in.
 *
 * Every spec signs in first through a shared `beforeEach` rather than reusing a stored
 * session, so a change that breaks the session cookie is caught by all of them rather
 * than by none.
 */

const PASSWORD = 'e2e-admin-password';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/dashboard');
});

function query<T>(sql: string, ...params: unknown[]): T | undefined {
	const db = new Database(DATABASE_PATH, { readonly: true });
	try {
		return db.prepare(sql).get(...(params as never[])) as T | undefined;
	} finally {
		db.close();
	}
}

test('the dashboard totals match the guest list', async ({ page }) => {
	// Three seeded households: one attending (2 + 1), one declined, one pending.
	await expect(page.getByText('Households invited')).toBeVisible();

	const invited = page.locator('div').filter({ hasText: /^Households invited/ }).first();
	await expect(invited).toContainText('3');

	await expect(page.getByText('Attending', { exact: true }).first()).toBeVisible();
});

test('every screen loads', async ({ page }) => {
	const screens: [string, string][] = [
		['/guests', 'Guests'],
		['/rsvps', 'RSVPs'],
		['/analytics', 'Analytics'],
		['/invitations', 'Invitations'],
		['/labels', 'Address labels'],
		['/qr', 'QR codes'],
		['/emails', 'Reminder emails'],
		['/content', 'Website'],
		['/log', 'Activity'],
		['/backups', 'Backups'],
		['/settings', 'Settings']
	];

	for (const [path, heading] of screens) {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
	}
});

test('a household can be added, edited and deleted', async ({ page }) => {
	await page.goto('/guests');

	await page.getByRole('button', { name: 'Add household' }).click();
	await page.getByLabel('Household name').fill('The Brand New Family');
	await page.getByLabel('Email').fill('New@Example.COM');
	await page.getByLabel('Expected party size').fill('5');
	await page.getByRole('button', { name: 'Add household' }).last().click();

	await expect(page.getByRole('status')).toContainText('Added The Brand New Family.');

	// Stored, and the email normalised on the way in.
	expect(
		query<{ email: string; party_size: number }>(
			'SELECT email, party_size FROM households WHERE name = ?',
			'The Brand New Family'
		)
	).toMatchObject({ email: 'new@example.com', party_size: 5 });

	// Edit it.
	await page.getByRole('row', { name: /The Brand New Family/ }).getByRole('button', { name: 'Edit' }).click();
	await page.getByLabel('Household name').fill('The Renamed Family');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toContainText('Saved The Renamed Family.');

	// Delete it.
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('row', { name: /The Renamed Family/ }).getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Delete household' }).click();
	await expect(page.getByRole('status')).toContainText('Deleted The Renamed Family.');

	expect(query('SELECT id FROM households WHERE name = ?', 'The Renamed Family')).toBeUndefined();
});

test('the guest list filters by status', async ({ page }) => {
	await page.goto('/guests?status=attending');
	await expect(page.getByRole('link', { name: SEEDED.attending })).toBeVisible();
	await expect(page.getByRole('link', { name: SEEDED.pending })).toHaveCount(0);

	await page.goto('/guests?status=pending');
	await expect(page.getByRole('link', { name: SEEDED.pending })).toBeVisible();
	await expect(page.getByRole('link', { name: SEEDED.attending })).toHaveCount(0);
});

test('the guest list searches by name', async ({ page }) => {
	await page.goto('/guests');

	await page.getByLabel('Search').fill('Marsh');
	await page.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByRole('link', { name: SEEDED.attending })).toBeVisible();
	await expect(page.getByRole('link', { name: SEEDED.pending })).toHaveCount(0);
});

test('an admin records a reply on a household behalf', async ({ page }) => {
	await page.goto('/rsvps');

	await page
		.getByRole('row', { name: new RegExp(SEEDED.pending) })
		.getByRole('button', { name: 'Record' })
		.click();

	await page.getByLabel('Guests from the household').fill('2');
	await page.getByLabel('Additional guests').fill('1');
	await page.getByRole('button', { name: 'Save reply' }).click();

	await expect(page.getByRole('status')).toContainText(`Saved the reply for ${SEEDED.pending}.`);

	expect(
		query<{ attending: number; guest_count: number; plus_one_count: number }>(
			`SELECT r.attending, r.guest_count, r.plus_one_count FROM rsvps r
			 JOIN households h ON h.id = r.household_id WHERE h.name = ?`,
			SEEDED.pending
		)
	).toMatchObject({ attending: 1, guest_count: 2, plus_one_count: 1 });

	// And the audit trail says a human typed it in.
	expect(
		query<{ description: string }>(
			"SELECT description FROM activity_log WHERE description LIKE '%entered by admin%' ORDER BY created_at DESC"
		)
	).toBeDefined();
});

test('an admin clears a reply, putting the household back to pending', async ({ page }) => {
	await page.goto('/rsvps');

	page.once('dialog', (dialog) => dialog.accept());
	await page
		.getByRole('row', { name: new RegExp(SEEDED.declined) })
		.getByRole('button', { name: 'Edit' })
		.click();
	await page.getByRole('button', { name: 'Clear this reply' }).click();

	await expect(page.getByRole('status')).toContainText('back to awaiting a reply');
	expect(
		query(
			'SELECT r.id FROM rsvps r JOIN households h ON h.id = r.household_id WHERE h.name = ?',
			SEEDED.declined
		)
	).toBeUndefined();
});

test('a household detail page shows its link and QR code', async ({ page }) => {
	await page.goto('/guests');
	await page.getByRole('link', { name: SEEDED.attending }).click();

	await expect(page.getByRole('heading', { level: 1 })).toHaveText(SEEDED.attending);
	await expect(page.getByText('/rsvp/e2e-attending-token')).toBeVisible();
	await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
});

test('rotating a token invalidates the previous link', async ({ page }) => {
	const before = query<{ token: string }>('SELECT token FROM households WHERE name = ?', SEEDED.pending);

	await page.goto('/guests');
	await page.getByRole('link', { name: SEEDED.pending }).click();

	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Issue a new link' }).click();

	await expect(page.getByRole('status')).toContainText('New link issued');

	const after = query<{ token: string }>('SELECT token FROM households WHERE name = ?', SEEDED.pending);
	expect(after?.token).not.toBe(before?.token);
});

test('a CSV import maps its columns and lands the rows', async ({ page }) => {
	await page.goto('/guests/import');

	const csv = [
		'Full Name,E-mail Address,Number of Guests,Wave',
		'"Imported, The Family",imported@example.com,4,Batch 9',
		'"The ""Quoted"" Family",not-an-email,2,Batch 9',
		',,,',
		''
	].join('\r\n');

	await page.getByLabel('Choose a file').setInputFiles({
		name: 'guests.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(csv, 'utf8')
	});
	await page.getByRole('button', { name: 'Preview import' }).click();

	// The headers were recognised without the admin touching a dropdown.
	await expect(page.getByText('Map the columns')).toBeVisible();
	await expect(page.getByText('is not a valid email address')).toBeVisible();

	await page.getByRole('button', { name: /Import \d+ rows/ }).click();

	await expect(page.getByText('2 added')).toBeVisible();

	// The quoted comma survived, and the bad email was dropped rather than stored.
	expect(
		query<{ party_size: number; batch: string }>(
			'SELECT party_size, batch FROM households WHERE name = ?',
			'Imported, The Family'
		)
	).toMatchObject({ party_size: 4, batch: 'Batch 9' });
	expect(
		query<{ email: string | null }>('SELECT email FROM households WHERE name = ?', 'The "Quoted" Family')
	).toMatchObject({ email: null });
});

test('the guest list exports as CSV', async ({ page }) => {
	await page.goto('/guests');

	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Export CSV' }).click();
	const file = await download;

	expect(file.suggestedFilename()).toMatch(/^guest-list-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('invitations generate as a PDF', async ({ page }) => {
	await page.goto('/invitations');

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Generate' }).click();
	const file = await download;

	expect(file.suggestedFilename()).toMatch(/\.pdf$/);
});

test('address labels generate as a PDF', async ({ page }) => {
	await page.goto('/labels');

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Generate PDF' }).click();
	const file = await download;

	expect(file.suggestedFilename()).toMatch(/^labels-5160-\d+\.pdf$/);
});

test('the website content editor saves', async ({ page }) => {
	await page.goto('/content');

	await page.getByLabel('Line above the names').fill('cannot wait to marry');
	await page.getByRole('button', { name: 'Save home page' }).click();

	await expect(page.getByRole('status')).toContainText('Home page saved.');

	// Round-trips: the value is what the editor now shows.
	await page.reload();
	await expect(page.getByLabel('Line above the names')).toHaveValue('cannot wait to marry');
});

test('turning a section off removes it from the guest site', async ({ page }) => {
	await page.goto('/content');

	await page.getByLabel('Registry', { exact: false }).uncheck();
	await page.getByRole('button', { name: 'Save sections' }).click();
	await expect(page.getByRole('status')).toContainText('Sections saved.');

	const stored = query<{ value: string }>("SELECT value FROM site_content WHERE key = 'sections'");
	expect(JSON.parse(stored!.value).registry).toBe(false);

	// Put it back, so the guest suite is unaffected by the order the two are run in.
	await page.getByLabel('Registry', { exact: false }).check();
	await page.getByRole('button', { name: 'Save sections' }).click();
	await expect(page.getByRole('status')).toContainText('Sections saved.');
});

test('an FAQ entry can be added from a template and saved', async ({ page }) => {
	await page.goto('/content/faq');

	const before = await page.getByRole('button', { name: 'Remove' }).count();
	await page.getByRole('button', { name: 'Add a question' }).click();

	const rows = page.getByRole('button', { name: 'Remove' });
	await expect(rows).toHaveCount(before + 1);

	await page.getByLabel('Question').last().fill('Is there parking?');
	await page.getByLabel('Answer').last().fill('Yes, plenty.');
	await page.getByRole('button', { name: 'Save FAQ' }).click();

	await expect(page.getByRole('status')).toContainText('FAQ saved.');
	const stored = query<{ value: string }>("SELECT value FROM site_content WHERE key = 'faq'");
	expect(stored!.value).toContain('Is there parking?');
});

test('an email template can be edited and previewed', async ({ page }) => {
	await page.goto('/emails');

	await page.getByRole('link', { name: 'Edit templates' }).click();
	await page.getByLabel('Subject').fill('Please reply, {{household_name}}');
	await page.getByRole('button', { name: 'Save template' }).click();

	// The save redirects back onto the template it just wrote, so the editor is still
	// open -- collapsing it the moment you saved would be a small cruelty.
	await expect(page).toHaveURL(/\/emails\?template=.*saved=1/);
	await expect(page.getByRole('status')).toContainText('Template saved.');

	// The preview substitutes the merge field with a sample value.
	await expect(page.getByText('Please reply, The Whitfield Family')).toBeVisible();
});

test('sending is blocked while Gmail is unconfigured', async ({ page }) => {
	await page.goto('/emails');

	// No GMAIL_USER in this environment, so the app says so rather than failing later.
	await expect(page.getByText('Gmail is not configured')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send reminders' })).toBeDisabled();
});

test('a backup can be taken, listed and downloaded', async ({ page }) => {
	await page.goto('/backups');

	await page.getByRole('button', { name: 'Back up now' }).click();
	await expect(page.getByRole('status')).toContainText('Backup created');

	const row = page.getByRole('row').filter({ hasText: 'wedding-rsvp-' }).first();
	await expect(row).toBeVisible();

	const download = page.waitForEvent('download');
	await row.getByRole('link', { name: 'Download' }).click();
	expect((await download).suggestedFilename()).toMatch(/^wedding-rsvp-.*\.db$/);
});

test('a restore refuses without the typed confirmation', async ({ page }) => {
	await page.goto('/backups');
	await page.getByRole('button', { name: 'Back up now' }).click();
	await expect(page.getByRole('status')).toContainText('Backup created');

	await page.getByRole('button', { name: 'Restore' }).first().click();
	await page.getByLabel('Type RESTORE').fill('yes please');
	await page.getByRole('button', { name: 'Restore this backup' }).click();

	await expect(page.getByRole('alert')).toContainText('Type RESTORE to confirm.');
});

test('settings save and take effect immediately', async ({ page }) => {
	await page.goto('/settings');

	await page.getByLabel('Venue', { exact: true }).fill('The Restored Barn');
	await page.getByRole('button', { name: 'Save settings' }).click();
	await expect(page.getByRole('status')).toContainText('Settings saved.');

	// No restart: the invitations screen reads the new venue straight away.
	await page.goto('/invitations');
	await expect(page.getByText('The Restored Barn')).toBeVisible();
});

test('the activity log records what happened, and filters', async ({ page }) => {
	await page.goto('/log');

	// Asserted through the filter rather than by hunting the first page: by the time
	// this spec runs the log holds dozens of entries and paginates.
	await page.getByLabel('Event').selectOption('settings_changed');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.locator('tbody tr').first()).toContainText('Changed settings');

	await page.getByLabel('Event').selectOption('guest_added');
	await page.getByRole('button', { name: 'Apply' }).click();

	// Wait for the navigation before reading the rows: `allInnerTexts` does not
	// auto-wait, so without this it can read the previous filter's table.
	await expect(page).toHaveURL(/type=guest_added/);
	await expect(page.locator('tbody tr').first()).toContainText('guest_added');

	const types = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
	expect(types.length).toBeGreaterThan(0);
	expect(new Set(types.map((text) => text.trim()))).toEqual(new Set(['guest_added']));
});

test('a form action cannot be posted without a CSRF token', async ({ request, page }) => {
	// The beforeEach already signed in, so a valid session cookie is in hand and the
	// only thing missing from the request below is the token itself.
	const cookies = await page.context().cookies();
	const response = await request.post('/guests?/create', {
		headers: {
			origin: 'http://127.0.0.1:4274',
			accept: 'text/html',
			cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
		},
		form: { name: 'The CSRF-less Family', partySize: '2' }
	});

	expect(response.status()).toBe(403);
	expect(query('SELECT id FROM households WHERE name = ?', 'The CSRF-less Family')).toBeUndefined();
});
