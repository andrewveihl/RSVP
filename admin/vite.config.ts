import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// better-sqlite3 is a native addon: Vite must leave it alone rather than try to
	// pre-bundle a .node binary, in dev and in the SSR build alike.
	optimizeDeps: { exclude: ['better-sqlite3'] },
	ssr: { external: ['better-sqlite3'] },
	server: {
		host: true,
		// A different port from the guest app, so both can run side by side and the
		// origin checks stay meaningful in development.
		port: 5174,
		strictPort: true
	},
	preview: {
		port: 4174,
		strictPort: true
	}
});
