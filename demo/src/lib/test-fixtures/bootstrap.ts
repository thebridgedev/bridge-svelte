/*
 * TEST FIXTURES ONLY — not part of the reference integration.
 *
 * The e2e suite flips a few things per test through localStorage, and needs
 * route rules for its fixture pages under src/routes/(test-fixtures). All of
 * that lives here so the demo's +layout.ts reads exactly like the guide; a real
 * app has no counterpart to this file.
 *
 *   bridge:appId          Playwright's global-setup seeds the stage/prod test
 *                         app id (the tracked .env.test.stage/.env.test.prod
 *                         leave VITE_BRIDGE_APP_ID empty on purpose). An
 *                         explicit option beats the environment.
 *   bridge:hostedMode     'true' drops `loginRoute` — hosted mode (TBP-629,
 *                         TBP-696). The one switch between hosted and in-app.
 *   bridge:defaultPaywall 'true' drops the /welcome opt-in, to prove where the
 *                         paywall goes when an app configures nothing (TBP-702).
 *   bridge:upgradeDialog  'false' turns the upgrade dialog off (TBP-703).
 */
import type { BridgeBootstrapOptions } from '@nebulr-group/bridge-svelte';

// Guarded: the server imports +layout.ts to read `ssr`, and has no localStorage.
const stored = (key: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key));

/** Rules for the fixture pages only. The demo's own pages need none beyond the layout's. */
const FIXTURE_RULES: NonNullable<BridgeBootstrapOptions['rules']> = [
	{ match: new RegExp('^/docs($|/)'), public: true },
	{ match: '/beta*', featureFlag: 'test-global-admin-access', redirectTo: '/', public: true },
	// TBP-178 — FF 2.0 works without auth.
	{ match: '/flag-context-demo', public: true },
	// TBP-241 — release-validation probes; read ?key= / ?attrs=, no login.
	{ match: '/discovery-probe', public: true },
	{ match: '/attr-probe', public: true },
	// TBP-698 — customisation level 4: the app's own sign-in form.
	{ match: '/headless', public: true },
	// TBP-756 — a route gated on a flag that is off because of the plan.
	{ match: '/feature-upgrade/gated', featureFlag: 'e2e-plan-gated', redirectTo: '/feature-upgrade' }
];

export function withTestFixtures(options: BridgeBootstrapOptions): BridgeBootstrapOptions {
	const appId = stored('bridge:appId') || undefined;
	const hostedMode = stored('bridge:hostedMode') === 'true';
	const defaultPaywall = stored('bridge:defaultPaywall') === 'true';
	const upgradeDialogOff = stored('bridge:upgradeDialog') === 'false';

	const { loginRoute, billing, rules, ...rest } = options;
	const { paywallRoute, ...billingRest } = billing ?? {};

	return {
		...rest,
		...(appId ? { appId } : {}),
		...(hostedMode ? {} : { loginRoute }),
		debug: true,
		billing: {
			...billingRest,
			...(defaultPaywall || paywallRoute === undefined ? {} : { paywallRoute }),
			...(upgradeDialogOff ? { upgradeDialog: false } : {})
		},
		rules: [...(rules ?? []), ...FIXTURE_RULES]
	};
}
