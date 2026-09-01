import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Self-hosted Node deployment behind nginx -- never adapter-auto.
		adapter: adapter({ out: 'build' }),
		alias: {
			// Code shared with the guest app. Using kit.alias rather than a raw Vite
			// alias means the generated tsconfig picks the path up too, so svelte-check
			// and the editor resolve it without a second declaration.
			$shared: '../shared/src'
		}
	}
};

export default config;
