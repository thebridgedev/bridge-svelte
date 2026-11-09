import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	// The demo imports the plugin from source. One copy of SvelteKit, Svelte and
	// auth-core for both, or `redirect()` from the plugin is not the demo's
	// Redirect and the page's client is not the plugin's.
	resolve: {
		dedupe: ['@sveltejs/kit', 'svelte', '@nebulr-group/bridge-auth-core']
	},

	server: {
		host: '0.0.0.0',
		port: 3001,
		strictPort: true,
		fs: { allow: ['..'] }
	},
	preview: {
		host: '0.0.0.0',
		port: 3001,
		strictPort: true
	}
});
