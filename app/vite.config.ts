import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// better-sqlite3 is a native addon: Vite must leave it alone rather than try to
	// pre-bundle a .node binary, in dev and in the SSR build alike.
	optimizeDeps: { exclude: ['better-sqlite3'] },
	ssr: { external: ['better-sqlite3'] },
	test: {
		// The shared package has no test runner of its own; its unit tests live here,
		// because this is the app that exercises nearly all of it.
		include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
		environment: 'node',
		globals: false,
		// Timestamps are formatted in local time, so pin the zone for tests. Keep pino
		// quiet so a failing assertion is not buried in JSON log lines, and point the
		// database at memory so no test can touch a real file.
		env: {
			TZ: 'UTC',
			LOG_LEVEL: 'silent',
			DATABASE_PATH: ':memory:',
			ADMIN_PASSWORD: 'test-password',
			PUBLIC_SITE_URL: 'http://localhost:5173',
			PUBLIC_ADMIN_URL: 'http://localhost:5174'
		}
	},
	server: {
		// Bind every interface so the site is reachable from a phone on the same
		// network -- the only honest way to check the mobile layout.
		host: true,
		port: 5173,
		// Fail loudly rather than silently moving to another port, which would break
		// both the origin check and the address typed into a phone.
		strictPort: true
	},
	preview: {
		port: 4173,
		strictPort: true
	}
});
