# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`<BridgeBillingRoutes />` — every billing page from one file** (TBP-702). Mounted from `src/routes/subscription/[...bridge]/+page.svelte`, it serves `/subscription` (current plan, plan picker, "Manage billing"), `/subscription/plan` (the paywall), `/subscription/success` and `/subscription/error` (where a checkout returns). An unknown segment gets the app's own 404. Customise with `--bridge-*` tokens, `frame(page, content)` / `heading(page)` snippets, or take over one page by creating it.
- **`<BridgePaywallPage />`** — an onboarding paywall at an address of the app's choosing (e.g. `/welcome`), opted into with `billing: { paywallRoute: '/welcome' }`.
- **`<BillingPortalButton />`** — the "Manage billing" button (Stripe billing portal) for the workspace owner.

### Changed

- **Billing destinations default to pages `<BridgeBillingRoutes>` serves:** `billing.manageRoute` `/billing` → `/subscription`; `billing.paymentErrorRoute` `/payment-error` → `/subscription/error`; `billing.paywallRoute` unset → `/subscription/plan`. The Upgrade/Manage buttons in `<BridgeQuotaBanner>` and `<BridgeBillingNotice>` follow `manageRoute`.
- **The default paywall redirect applies only to an app that uses billing** (it has at least one plan) and whose `paymentsAutoRedirect` is on. An explicit `billing.paywallRoute` applies as before; `paywallRoute: false` turns the redirect off. The redirect never leaves the payment-error page.

### Migration

- **Apps with billing (plans) must add `src/routes/subscription/[...bridge]/+page.svelte` rendering `<BridgeBillingRoutes />` before upgrading** — or set `billing: { paywallRoute: false }` (e.g. apps gating with the `<BridgePaywall>` overlay). Otherwise a workspace without a plan is redirected to `/subscription/plan`, and a failed checkout to `/subscription/error`, which the app does not have.
- Apps that relied on the old `/billing` or `/payment-error` defaults either set `billing.manageRoute` / `billing.paymentErrorRoute` explicitly or move to the new pages.

## [0.2.2] - 2026-02-25

### Changed

- **`bridgeBootstrap()` now returns `{ flagsReady: Promise<void> }`** — the flag fetch runs in parallel with your page's own data loading instead of blocking bootstrap completion. Pages that don't depend on flags start rendering sooner; pages that do can `await flagsReady` before checking flag-gated content.
- **`createRouteGuard(flagsReady?)` accepts the optional promise** — when a route has a `featureFlag` rule the guard awaits `flagsReady` before evaluating it; routes without flag checks are unaffected and proceed immediately.

## [0.2.1] - 2025-02-17

### Added

- Install test: `bun run test:install` and CI workflow to verify the packed package installs with Svelte 5 and SvelteKit 2.

### Fixed

- Install test script now cleans up `install-test-tmp` and `install-test-pkg.tgz` after run (and on exit).

## [0.2.0] - 2025-02-15

### Added

- Plan service: `planService.redirectToPlanSelection()` for subscription/plan management flows.
- E2E test suite (Playwright) for auth, route guards, feature flags, and team management.

### Changed

- **Breaking:** Route config is passed to `bridgeBootstrap(url, config, routeConfig)` in `+layout.ts`; `BridgeBootstrap` component no longer accepts a `routeConfig` prop.
- **FeatureFlag** (Svelte 5): use snippet API `{#snippet children({ enabled, rawEnabled })}` instead of `let:enabled` / `let:rawEnabled`.
- Documentation: README, quickstart, and examples updated (package name `@nebulr-group/bridge-svelte`, correct links, default callback `/auth/oauth-callback`, route protection and FeatureFlag examples).
- Learning docs structure documented in `learning/README.md`.

### Fixed

- Removed references to non-existent `fallback` prop on `FeatureFlag`.
- Corrected typos and wording in examples (e.g. "bridge" → "the" where appropriate).

## [0.2.0-alpha.9] - Previous

Pre-release version before 0.2.0.

[0.2.2]: https://github.com/thebridgedev/bridge-svelte/releases/tag/v0.2.2
[0.2.1]: https://github.com/thebridgedev/bridge-svelte/releases/tag/v0.2.1
[0.2.0]: https://github.com/thebridgedev/bridge-svelte/releases/tag/v0.2.0
[0.2.0-alpha.9]: https://github.com/thebridgedev/bridge-svelte/releases/tag/v0.2.0-alpha.9
