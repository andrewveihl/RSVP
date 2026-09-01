import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the guest site.
 *
 * The webServer boots a real production build against a throwaway database file, so
 * the suite exercises the same code the containers run -- adapter-node, real SQLite,
 * real form actions -- rather than a dev server with different behaviour.
 *
 * The database is deleted and reseeded by `tests/e2e/fixtures.ts` before the run, so
 * the suite starts from a known guest list every time.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.test.ts',
	// One server, one SQLite file: parallel workers would race on the same rows.
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
	globalSetup: './tests/e2e/global-setup.ts',
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4273',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
	],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: 'node build/index.js',
				port: 4273,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
				env: {
					PORT: '4273',
					HOST: '127.0.0.1',
					// adapter-node needs ORIGIN to build absolute URLs behind a proxy, and
					// the CSRF origin check compares against it.
					ORIGIN: 'http://127.0.0.1:4273',
					NODE_ENV: 'production',
					DATABASE_PATH: './.e2e-data/wedding.db',
					PUBLIC_SITE_URL: 'http://127.0.0.1:4273',
					PUBLIC_ADMIN_URL: 'http://127.0.0.1:4274',
					// Far in the future, so the deadline is open for most specs. The
					// closed-deadline case gets its own server in rsvp-deadline.test.ts.
					RSVP_DEADLINE: '2099-12-31',
					WEDDING_DATE: '2099-12-31',
					COUPLE_NAMES: 'Andrew & Madeline',
					CONTACT_EMAIL: 'hello@example.com',
					// The whole suite shares one server, so the production budget of 20/min
					// would throttle the tests themselves. Rate limiting has its own unit
					// tests, where the window can be controlled exactly.
					RATE_LIMIT_MAX: '500',
					PAGE_RATE_LIMIT_MAX: '2000',
					TZ: 'UTC',
					LOG_LEVEL: 'warn'
				}
			}
});
