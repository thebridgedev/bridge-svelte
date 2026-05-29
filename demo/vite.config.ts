import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	// Dedupe @sveltejs/kit and svelte so the source-aliased bridge-svelte plugin
	// shares a single module instance with the demo. Without this, `redirect()`
	// thrown from the plugin produces a `Redirect` instance from a different
	// @sveltejs/kit copy, fails the demo's `instanceof Redirect` check, and
	// surfaces as a pageerror instead of redirecting.
	resolve: {
		dedupe: ['@sveltejs/kit', 'svelte']
	},

	server: {
		host: '0.0.0.0',        // <== required for container access
		port: 3001,             // <== container port (Docker Compose maps host:3008 → container:3001)
		strictPort: true,       // <== optional: fail if port is in use
		watch: {
		  usePolling: true      // <== optional: fixes HMR issues in some containers
		}
	  }
});
