import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	package: {
		// Ensure svelte-package outputs to dist used by npm publish
		dir: 'dist'
	}
};

export default config;
