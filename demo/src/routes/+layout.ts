import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';
import { env } from '$env/dynamic/public';

export const ssr = false;

// The issuer comes from PUBLIC_BRIDGE_ISSUER, so the same build runs against
// a local Bridge or stage.
export const load = bridgeBootstrap({
	rules: [
		{ match: '/', public: true },
		{ match: '/custom/*', public: true },
		{ match: '/framed/*', public: true },
		{ match: '/headless', public: true },
		// A page only some people see: the flag's rule says who.
		{ match: '/reports', featureFlag: 'reports', redirectTo: '/' }
	],
	// Bridge's own sign-in page turns this on to sign people in for the CLI.
	handoff: { loopback: true, program: 'the Bridge CLI' },
	// PUBLIC_DEMO_STORAGE=memory keeps the session in the page's memory only: nothing in the browser's storage.
	storage: env.PUBLIC_DEMO_STORAGE === 'memory' ? 'memory' : 'local'
});
