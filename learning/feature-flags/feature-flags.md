---
title: Feature Flags
order: 40
oneLiner: Ship behind a flag and change who sees what, live from Control Center, no redeploy.
related: [live-updates, payments]
---

# Feature Flags

Bridge Feature Flags lets you ship code dark, roll it out gradually, target it
at specific users, and kill it instantly, all without a deploy. The SDK
evaluates flags locally: it keeps your flag rules in memory, evaluates them
against in-process context, and receives rule changes over the live channel (a
persistent realtime connection the SDK maintains). A flag check is an O(1)
lookup with no network call, safe in render paths.

Flags work standalone: an `appId` is all the configuration you need. Bridge
auth and billing are optional context sources you can target on once they're
enabled.

## The mental model

1. **You create a flag in Control Center** (your admin dashboard at
   app.thebridge.dev) and give it rules: on/off, a percentage rollout, or
   conditions on attributes like `user.role` or `tenant.plan`.
2. **The SDK evaluates those rules locally** against the eval context: the
   identity and attributes a flag rule evaluates against. Bridge auth and
   billing feed attributes in automatically; your code can add its own.
3. **Changes arrive live.** Edit a rule in Control Center and every connected
   app updates in place, typically within seconds, over the live channel. No
   refresh, no redeploy.

For the full picture (evaluation model, outage behavior, connection status),
read [How flags work](/feature-flags/how-it-works/).

## Get started

[Get started](/feature-flags/get-started/) walks the whole loop in a few
minutes: wire up `<BridgeBootstrap />`, create a flag in Control Center, read
it with `useFlag`, then flip it and watch your app change live.

## Using flags

- [Show or hide UI](/feature-flags/using/show-hide-ui/): the declarative
  `<FeatureFlag>` component, with fallback content for the off case.
- [Use flags in your logic](/feature-flags/using/in-logic/): the `useFlag` API
  for branching code paths, plus `flagStore` and multi-type values (boolean,
  string, number, JSON).
- [Guard routes](/feature-flags/using/guard-routes/): gate whole routes behind
  a flag with `routeConfig` rules; the SDK's route guard redirects before the
  route renders.
- [Use flags on your backend](/feature-flags/using/backend/): forward the eval
  context in the `x-bridge-context` header so your server and browser agree on
  identity and bucketing.

## Targeting

- [Target by plan or role](/feature-flags/targeting/by-plan-or-role/): with
  Bridge auth or billing enabled, attributes like `user.role`, `tenant.plan`,
  and `bridge:billing.*` merge into every evaluation with no app code. For
  plan-granted features, prefer entitlement attributes; see
  [Lock features to a plan](/billing/limits/lock-features/).
- [Send context from your code](/feature-flags/targeting/send-context/):
  supply app-specific facts (like a project count) per call or app-wide via
  `bridge.attributes` on the `bridge` object. The full attributes API is in
  the [Live Updates guide](/live-updates/).
- [Target anonymous visitors](/feature-flags/targeting/anonymous/): visitors
  who aren't signed in get a persisted anonymous ID and stable bucketing, so
  percentage rollouts and A/B tests work before signup and never flicker.
