import preset from '../shared/tailwind.preset.js';

/** @type {import('tailwindcss').Config} */
export default {
	presets: [preset],
	content: ['./src/**/*.{html,js,svelte,ts}']
};
