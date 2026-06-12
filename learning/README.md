# Learning Documentation

This directory contains the Bridge Svelte learning docs.

## Guides

- **[Hosted Auth Quickstart](quickstart/hosted-quickstart.md)** — Fastest path: Bridge handles the login UI on a hosted page.
- **[SDK Auth Quickstart](sdk-auth/sdk-quickstart.md)** — In-app login/signup forms using SDK components. Includes a Styles section linking to [Theming](theming/theming.md) for CSS variable theming, component-level overrides, and headless usage.
- **[Live Updates & the Bridge Surface](live-updates/live-updates.md)** — The unified `bridge` object (branding, workspace, subscription, entitlements, user), live channel events, and app-wide flag attributes.
- **[Configuration Reference](configuration/configuration.md)** — The full `BridgeConfig` type, `bridgeBootstrap()` signature, route guard rules, and the `.env` pattern.
- **[Examples](examples/examples.md)** — Detailed examples for every feature:
  - Authentication (route protection, auth status, profile, logout)
  - SDK auth components (LoginForm, SignupForm, MFA, passkeys, magic link, SSO, tenant/workspace selection)
  - Feature flags (component, route-level, programmatic access)
  - Payments & subscriptions (live subscription state, billing components, entitlements, PlanSelector, Stripe, billing portal)
  - Team management
  - API token management
  - Configuration reference
