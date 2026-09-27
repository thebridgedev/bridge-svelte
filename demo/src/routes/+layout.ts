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
// `bridge:defaultPaywall` — TBP-702: drops the /welcome opt-in below, so the
// suite can prove where the paywall goes when an app configures nothing.
//
<<<<<<< HEAD
=======
// `bridge:upgradeDialog` — TBP-703: 'false' turns the upgrade dialog off, so
// the suite can prove the config switch works. A real app writes
// `billing: { upgradeDialog: false }` — or leaves it out (on by default).
//
>>>>>>> origin/feature/mcp-journey
// Guarded: the server imports this module to read `ssr`, and has no localStorage.
const stored = (key: string) =>
	typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
const storedAppId = stored('bridge:appId') || undefined;
const hostedMode = stored('bridge:hostedMode') === 'true';
const defaultPaywall = stored('bridge:defaultPaywall') === 'true';
<<<<<<< HEAD
=======
const upgradeDialogOff = stored('bridge:upgradeDialog') === 'false';
>>>>>>> origin/feature/mcp-journey

export const load = bridgeBootstrap({
	...(storedAppId ? { appId: storedAppId } : {}),
	...(hostedMode ? {} : { loginRoute: '/auth/login' }),
	debug: true,
	// TBP-702 — the optional onboarding page. Without this line plan-less
	// workspaces go to /subscription/plan, which routes/subscription/[...bridge]
	// serves along with the subscription page and the checkout return pages.
<<<<<<< HEAD
	...(defaultPaywall ? {} : { billing: { paywallRoute: '/welcome' } }),
=======
	billing: {
		...(defaultPaywall ? {} : { paywallRoute: '/welcome' }),
		...(upgradeDialogOff ? { upgradeDialog: false } : {})
	},
>>>>>>> origin/feature/mcp-journey
	rules: [
		{ match: '/', public: true },
		{ match: new RegExp('^/auth($|/)'), public: true },
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
