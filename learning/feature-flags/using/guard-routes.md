# Guard routes

Gate entire routes behind flags with `routeConfig` rules:

```ts
const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};
```

A `featureFlag` requirement on a route rule is evaluated server-side by the SDK's route guard before the route renders — it's independent of the in-component `useFlag` / `<FeatureFlag>` surface. `bridgeBootstrap()` warms the route-guard's flag cache internally, so no extra setup is needed: declare the rule and the guard redirects when the flag is off.
