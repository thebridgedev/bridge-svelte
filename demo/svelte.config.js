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
			// `/styles` first — it points at a file, the bare name at the folder
			// (index.ts, and flags/index.ts for `/flags`).
			'@nebulr-group/bridge-svelte/styles': '../bridge-svelte/src/lib/styles.css',
			'@nebulr-group/bridge-svelte': '../bridge-svelte/src/lib',
			// Deep imports into the plugin, used by the test fixtures only.
			'@bridge-svelte': '../bridge-svelte/src',
			// Single source of truth for doc content — same `/learning` tree the
			// public Astro docs hub renders via the sync-docs action.
			$learning: '../learning'
		}
	}
};

export default config;
