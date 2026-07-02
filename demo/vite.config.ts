import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	// Dedupe @sveltejs/kit and svelte so the source-aliased bridge-svelte plugin
	// shares a single module instance with the demo. Without this, `redirect()`
	// thrown from the plugin produces a `Redirect` instance from a different
	// @sveltejs/kit copy, fails the demo's `instanceof Redirect` check, and
	// surfaces as a pageerror instead of redirecting.
	//
	// @nebulr-group/bridge-auth-core is deduped for the same reason: the
	// source-aliased bridge-svelte plugin and the demo's own imports must share
	// ONE auth-core module instance, or `useBridge()` resolves to two separate
	// quota-store singletons (the demo page reads one, the live realtime push
	// feeds the other) — see TBP-275 usage-metered harness.
	resolve: {
		dedupe: ['@sveltejs/kit', 'svelte', '@nebulr-group/bridge-auth-core']
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
