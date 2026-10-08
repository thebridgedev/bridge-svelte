# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-09-30

### Added

- **One-line start.** Bridge now starts with one line and no arguments: it reads its settings from the environment, settings you pass explicitly win, and the app shell shows nothing until Bridge is ready. Previously every setting had to be copied into the layout by hand, and a forgotten one could quietly point a stage app at the production API.
- **Built-in sign-in pages.** One file now serves every login page, including the one that verification emails link to, so a missing page can no longer break signup. Restyle the frame around the forms, or take over any single page by creating it; the rest keep working. Hosted login uses the same file.
- **Built-in subscription and paywall pages.** One file serves the subscription page, the paywall and the checkout success and error pages, so the manage-billing button always has somewhere to go. A welcome page for onboarding is a one-line opt-in.
- **Upgrade dialog at a plan limit.** When the server refuses an action because a plan limit is reached, the app shows the upgrade dialog itself, with no Bridge code on the page. Two components cover buttons that should react before the click. A limit that has not loaded yet no longer reads as zero and disables the feature.
- **Why a feature is off.** A feature flag now tells the app why it is off: not on the plan opens the upgrade dialog, not allowed for this person tells them to ask an admin, and switched off simply hides it. This works the same in the browser and on the backend.
- **Plan features in the plan picker.** The plan picker lists the features each plan includes, and the upgrade dialog names the plans that include the feature being asked for.
- **Seat limits on the built-in team page.** On a plan with a seat limit, the team page stops invitations at the limit, and the member count stays correct for everyone.
- **More of Bridge is importable.** The team dialogs, the usage reporter, the quota reader and other pieces the guides tell you not to rebuild can now be imported from this package.

### Changed

- **Core package included.** The core Bridge package now installs with the plugin, so there is no second package to add.
- **Theming.** The theme variables are the documented way to restyle Bridge to match your app, and the demo app shows the reference integration you can copy.
- **Guides.** The integration guides are much shorter and describe the decisions you make, with one page explaining how limits, upgrades and customization work. They teach feature flags as the way to gate pages, links and buttons, and a page that checks the plan directly logs a one-time note in development.

### Fixed

- **Role changes reaching open apps.** A role change made by an admin now reaches the person's open app without a reload. Since 0.8.2 it could be lost while the app was reconnecting.
- **Billing screens stay current.** Plans added after a tab was opened now appear without a reload, the success page shows the new plan straight after checkout instead of "Subscription unavailable", and choosing Free takes you into the app instead of leaving you on the plan picker.

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
