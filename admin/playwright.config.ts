import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the admin app.
 *
 * It runs against its own database file, separate from the guest suite's, so the two
 * can run in either order or at the same time without one seeding rows the other
 * asserts on.
 *
 * Only one project. The admin is a working tool used by two people on whatever device
 * is to hand; the layout is responsive but the *behaviour* is the same everywhere, and
 * running every spec twice would only double the runtime against one SQLite file.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.test.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
	globalSetup: './tests/e2e/global-setup.ts',
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4274',
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } }],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: 'node build/index.js',
				port: 4274,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
				env: {
					PORT: '4274',
					HOST: '127.0.0.1',
					ORIGIN: 'http://127.0.0.1:4274',
					NODE_ENV: 'production',
					DATABASE_PATH: './.e2e-data/wedding.db',
					BACKUP_DIR: './.e2e-data/backups',
					ADMIN_PASSWORD: 'e2e-admin-password',
					PUBLIC_SITE_URL: 'http://127.0.0.1:4273',
					PUBLIC_ADMIN_URL: 'http://127.0.0.1:4274',
					RSVP_DEADLINE: '2099-12-31',
					WEDDING_DATE: '2099-12-31',
					COUPLE_NAMES: 'Andrew & Madeline',
					// Successful logins spend this budget too, and nearly every spec signs
					// in, so the production figure of five would lock the suite out of its
					// own server. The real limit is asserted in rate-limit.test.ts, which
					// starts a server configured with it.
					ADMIN_LOGIN_RATE_LIMIT_MAX: '500',
					// Long enough that the idle-logout timer never fires mid-spec.
					ADMIN_SESSION_TTL_MS: '3600000',
					BODY_SIZE_LIMIT: '16777216',
					TZ: 'UTC',
					LOG_LEVEL: 'warn'
				}
			}
});
