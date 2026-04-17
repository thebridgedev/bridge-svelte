import { defineConfig } from 'vitest/config';

/**
 * Minimal Vitest config for bridge-svelte unit tests.
 *
 * Tests run in a `node` environment (SvelteKit-agnostic) so we can cover
 * pure TS utilities (pii-hashing, reddit-tracking) without spinning up the
 * SvelteKit/Vite dev server. Browser-only globals (`window`, `dataLayer`)
 * are stubbed inline per test.
 *
 * NOTE: vitest is NOT added to the shipped package — the `files` whitelist
 * in package.json restricts the npm tarball to `dist/`, `README.md`, and
 * `LICENSE`. Test files co-located in `src/` are never published.
 */
export default defineConfig({
	test: {
		include: ['src/**/*.{spec,test}.ts'],
		environment: 'node',
		globals: false,
		// Kill the suite if a single test hangs; pure unit tests finish in ms.
		testTimeout: 10000,
	}
});
