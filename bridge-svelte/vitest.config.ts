import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stub = (file: string) => fileURLToPath(new URL(`./test-stubs/${file}`, import.meta.url));

/**
 * Unit tests run in Node against auth-core's fake issuer, with stand-ins for
 * the SvelteKit modules the plugin imports. Test files live next to the code
 * and are kept out of the npm tarball by the `files` negations in package.json.
 */
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: {
			'$app/navigation': stub('app-navigation.ts'),
			'$app/state': stub('app-state.ts'),
			'$env/dynamic/public': stub('env-public.ts'),
		},
	},
	test: {
		include: ['src/**/*.{spec,test}.ts'],
		environment: 'node',
		globals: false,
		testTimeout: 10000,
	},
});
