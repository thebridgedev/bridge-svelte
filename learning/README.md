# Learning Documentation

This directory contains the Bridge Svelte learning docs.

## Guide sections

- **[auth/](auth/)**: authentication end to end. Sign-in methods, UI components (login, signup, MFA, passkeys, magic link, SSO, team management, tokens), the user token, roles and privileges, route guards, API tokens, multi-tenancy, and the configuration reference.
- **[billing/](billing/)**: subscriptions and payments. How billing works, Stripe setup, plan definition, onboarding users onto plans, plan limits and entitlements, subscription status, and lifecycle (trials, failed payments, billing events, billing portal).
- **[feature-flags/](feature-flags/)**: feature flags. How flags work, getting started, using flags in UI/logic/routes, and targeting.

## Top-level guides

- **[Hosted auth quickstart](quickstart/hosted-quickstart.md)**: fastest path, Bridge handles the login UI on a hosted page.
- **[SDK auth quickstart](sdk-auth/sdk-quickstart.md)**: in-app login/signup forms using SDK components.
- **[Live updates and the `bridge` object](live-updates/live-updates.md)**: the unified `bridge` object (branding, workspace, subscription, entitlements, user), live channel events, and app-wide flag attributes.
- **[Theming & Styles](theming/theming.md)**: CSS variable theming, component-level overrides, and headless usage.
- **[Branding](branding/branding.md)**: per-workspace white-labeling with the live branding snapshot.
