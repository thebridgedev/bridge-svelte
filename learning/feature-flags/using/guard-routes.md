# Guard routes

Gate entire routes behind flags with route rules, passed to the
`bridgeBootstrap({ … })` call in your root `+layout.ts`:

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [
    { match: '/', public: true },
    { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },
  ],
  defaultAccess: 'protected',
});
```

`defaultAccess: 'protected'` means any route no rule matches requires a
signed-in user; set it to `'public'` to leave unmatched routes open instead.

A `featureFlag` requirement on a route rule is evaluated by the SDK's route
guard inside `bridgeBootstrap()`, so it runs in your layout's `load` function
on every navigation, before the route renders, against the same local flag
cache the rest of the SDK uses. It's independent of the in-component
`useFlag` / `<FeatureFlag>` surface. `bridgeBootstrap()` warms that flag
cache internally, so no extra setup is needed: declare the rule and the guard
redirects when the flag is off.

## When the plan is the reason

If a route's flag is off because the workspace's plan doesn't include the
feature (its rule is `bridge:billing.entitlement.<feature> eq true`, and an
upgrade alone would turn it on), the guard doesn't just bounce the visitor: the upgrade dialog opens,
naming the plans that include the feature. You write nothing on the page.

- **Clicking into the route** keeps the visitor on the page they were on, with
  the dialog open.
- **Opening the route directly** (first load, a bookmark) sends them to the
  rule's `redirectTo` first, and the dialog opens there.
- **Losing access while on the route** (a downgrade) moves them to `redirectTo`
  with the dialog open.

A route off for any other reason (role, privilege, switched off) redirects to
`redirectTo` as before, with no dialog. `billing.upgradeDialog: false` turns
the dialog off everywhere.

## How this differs from `useFlag` / `<FeatureFlag>`

Both paths run the same FF 2.0 rule evaluator over the same flag records, so
they agree on the verdict. They differ on *when* they evaluate and on *what
context they can see*:

| | Route guard | `<FeatureFlag>` / `useFlag` |
|---|---|---|
| Evaluated | server-side, via the Bridge eval API, against the session | in-browser, against the local flag cache |
| Freshness | re-checked live — see below | realtime push, instant |
| Context | derived from the access token (`user.*`, `tenant.*`, `privileges`) and the workspace's billing (`bridge:billing.*`, except quota numbers) | local context + `bridge.attributes` + per-call `context` |
| Values | boolean gate only | any value type |

**Freshness.** The route guard keeps its verdicts in a cache, and the SDK drops
that cache the moment something that can change a verdict arrives on the live
channel: a flag change, a plan change, an entitlements change, a user state
change, or a new access token. `<BridgeBootstrap>` then re-checks the page
the user is **currently** on (not just the next navigation), so turning a route's
flag off, or downgrading a plan, moves the user off a page they no longer
qualify for within about a second. The current page is re-checked on a flag
change only for flags your route rules name. If live updates are off (for
example a proxy blocks WebSockets), the cache expires after 5 minutes instead.

A rule that targets attributes you publish client-side with
`bridge.attributes.set(...)` is invisible to the route guard, so rules used by
route guards should target token-derived paths.

Route rules can also guard on authentication and billing state; see
[Route guards](/auth/securing/route-guards/) in the Auth section for the full
`RouteRule` reference.
