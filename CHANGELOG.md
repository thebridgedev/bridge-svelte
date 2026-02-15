# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/thebridgedev/bridge-svelte/releases/tag/v0.2.0
[0.2.0-alpha.9]: https://github.com/thebridgedev/bridge-svelte/releases/tag/v0.2.0-alpha.9
