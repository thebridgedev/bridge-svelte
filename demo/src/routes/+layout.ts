import { bridgeBootstrap } from '@bridge-svelte/lib/client/BridgeBootstrap';

// TBP-695 — the whole Bridge wiring is this one call. The app id and API/hosted
// addresses come from VITE_BRIDGE_APP_ID / VITE_BRIDGE_API_BASE_URL /
// VITE_BRIDGE_HOSTED_URL (see .env.example); anything passed here wins over them.
export const ssr = false;

// Demo-only overrides — a real app leaves these out.
//
// `bridge:appId` — Playwright's global-setup seeds the stage/prod test app id
// into localStorage (the tracked .env.test.stage/.env.test.prod leave
// VITE_BRIDGE_APP_ID empty on purpose). An explicit option beats the
// environment, so this wins when set and falls through to the env when not.
//
// `bridge:hostedMode` — TBP-629: SDK mode and hosted mode differ by exactly one
// thing, whether `loginRoute` is set. The hosted branch is otherwise
// unreachable from this demo, so a toggle lets one server serve both.
//
// Guarded: the server imports this module to read `ssr`, and has no localStorage.
const stored = (key: string) =>
	typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
const storedAppId = stored('bridge:appId') || undefined;
const hostedMode = stored('bridge:hostedMode') === 'true';

export const load = bridgeBootstrap({
	...(storedAppId ? { appId: storedAppId } : {}),
	...(hostedMode ? {} : { loginRoute: '/auth/login' }),
	debug: true,
	billing: { paywallRoute: '/welcome', paymentErrorRoute: '/payment-error' },
	rules: [
		{ match: '/', public: true },
		{ match: new RegExp('^/auth($|/)'), public: true },
		{ match: '/welcome', public: true },
		{ match: new RegExp('^/docs($|/)'), public: true },
		{ match: '/beta*', featureFlag: 'test-global-admin-access', redirectTo: '/', public: true },
		// /flag-context-demo — TBP-178 E2E sandbox; FF 2.0 works without auth
		{ match: '/flag-context-demo', public: true },
		// /discovery-probe — TBP-241 Phase 1.5 release-validation probe;
		// exercises SDK discover-flow against an arbitrary ?key=, no auth needed.
		{ match: '/discovery-probe', public: true },
		// /attr-probe — TBP-241 Phase 2 rule-coverage probe; reads ?key= +
		// ?attrs= JSON and forwards as per-call attributes to useFlag.
		// Public so #9 / #13 / #15 don't need to log in.
		{ match: '/attr-probe', public: true }
	],
	defaultAccess: 'protected'
});
