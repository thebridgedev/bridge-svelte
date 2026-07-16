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

Route rules can also guard on authentication and billing state; see
[Route guards](/auth/securing/route-guards/) in the Auth section for the full
`RouteRule` reference.
