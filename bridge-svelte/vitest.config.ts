import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/**
 * Minimal Vitest config for bridge-svelte unit tests.
 *
 * Tests run in a `node` environment (SvelteKit-agnostic) so we can cover
 * pure TS utilities (pii-hashing, reddit-tracking) without spinning up the
 * SvelteKit/Vite dev server. Browser-only globals (`window`, `dataLayer`)
 * are stubbed inline per test.
 *
 * The svelte plugin compiles `.svelte` files so components can be rendered
 * with `svelte/server` (TBP-644 dev badge). `$app/*` is not available here —
 * tests that render a component mock the `$app/*` modules it imports.
 *
 * NOTE: test files co-located in `src/lib` ARE compiled into `dist/` by
 * svelte-package (it copies everything under src/lib). The `files` field in
 * package.json keeps them out of the npm tarball with `!dist/**\/*.test.*` and
 * `!dist/**\/*.spec.*` negations (TBP-647) — keep those if you touch `files`.
 */
export default defineConfig({
	plugins: [svelte()],
	test: {
		include: ['src/**/*.{spec,test}.ts'],
		environment: 'node',
		globals: false,
		// Kill the suite if a single test hangs; pure unit tests finish in ms.
		testTimeout: 10000,
	}
});
