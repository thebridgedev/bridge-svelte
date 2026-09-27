import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';
// Demo-only: the e2e suite's per-test switches and fixture-page rules.
import { withTestFixtures } from '$lib/test-fixtures/bootstrap';

export const ssr = false;

export const load = bridgeBootstrap(
	withTestFixtures({
		loginRoute: '/auth/login',
		billing: { paywallRoute: '/welcome' },
		rules: [
			{ match: '/', public: true },
			{ match: new RegExp('^/auth($|/)'), public: true }
		]
	})
);
