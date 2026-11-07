import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out bridge adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		alias: {
			// The demo imports the plugin by its published name, exactly as an app
			// does, but from source: no build step between an edit and the page.
			// The subpaths first: they point at files, the bare name at the folder.
			'@nebulr-group/bridge-svelte/styles': '../bridge-svelte/src/lib/styles.css',
			'@nebulr-group/bridge-svelte/server': '../bridge-svelte/src/lib/server/index.ts',
			'@nebulr-group/bridge-svelte': '../bridge-svelte/src/lib'
		}
	}
};

export default config;
