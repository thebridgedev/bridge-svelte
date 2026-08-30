# Guard routes

Gate entire routes behind flags with `routeConfig` rules. `RouteGuardConfig`
is imported from `@nebulr-group/bridge-svelte`, and the config is passed as
the third argument to the `bridgeBootstrap(url, config, routeConfig)` call in
your root `+layout.ts`:

```ts
// src/routes/+layout.ts
import { bridgeBootstrap, type RouteGuardConfig } from '@nebulr-group/bridge-svelte';

const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

export const load = async ({ url }) => {
  await bridgeBootstrap(url, { appId: 'your-app-id' }, routeConfig);
};
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

## How this differs from `useFlag` / `<FeatureFlag>`

Both paths run the same FF 2.0 rule evaluator over the same flag records, so
they agree on the verdict. They differ on *when* they evaluate and on *what
context they can see*:

| | Route guard | `<FeatureFlag>` / `useFlag` |
|---|---|---|
| Evaluated | server-side, via the Bridge eval API, against the session | in-browser, against the local flag cache |
| Freshness | cached ~5 minutes — a dashboard toggle is **not** instant | realtime push, instant |
| Context | derived from the access token (`user.*`, `tenant.*`) | local context + `bridge.attributes` + per-call `context` |
| Values | boolean gate only | any value type |

Two consequences worth planning around. A rule that targets attributes you
publish client-side with `bridge.attributes.set(...)` is invisible to the route
guard, so rules used by route guards should target token-derived paths. And if a
route must react to a toggle immediately, gate the route's *content* with
`<FeatureFlag>` in addition to the rule — the rule keeps the URL honest, the
component keeps the pixels fresh.

Route rules can also guard on authentication and billing state; see
[Route guards](/auth/securing/route-guards/) in the Auth section for the full
`RouteRule` reference.
