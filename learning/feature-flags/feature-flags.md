# Feature Flags

Bridge Feature Flags evaluates locally — the SDK keeps the flag rules in memory, evaluates against in-process context, and receives rule changes live over a push channel. A flag check is an O(1) lookup: no network call, safe in render paths.

Flags work standalone: an `appId` is all the configuration you need. Bridge auth and billing are optional context sources (see "Bridge-managed attributes" below).

### Setup

Bridge bootstraps flags automatically when the flags module is on your dependency graph:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  // Keep the flags module on the static dependency graph —
  // <BridgeBootstrap /> auto-attaches it (rule cache, live updates, telemetry).
  import '@nebulr-group/bridge-svelte/flags';

  let { children } = $props();
</script>

<BridgeBootstrap />
{@render children()}
```

No flag-specific init call is needed — configuration comes from the same `bridgeBootstrap(url, config, routeConfig)` you already call in `+layout.ts` (only `appId` is required for flags-only apps).

### useFlag — reactive flag values

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const banner = useFlag('show_banner', false);
</script>

{#if banner.value}
  <div class="banner">New stuff!</div>
{/if}
```

`useFlag(key, defaultValue, context?)` returns `{ value, passed }` backed by Svelte 5 runes:

- **`value`** — the evaluated flag value, typed from your default (`boolean` | `string` | `number` | JSON object).
- **`passed`** — whether a rule branch matched.
- The result is **reactive**: when an admin changes the flag (or a live rule update arrives), `value` updates in place.
- The default is mandatory — it's what your app gets when the flag isn't configured or Bridge is unreachable. A flag call can never break your app.

All three arguments accept getter functions for reactive inputs:

```svelte
<script lang="ts">
  const greeting = useFlag(
    () => `greeting_${locale}`,        // reactive key
    'Hello',
    () => ({ attributes: { locale } }) // reactive per-call context
  );
</script>
```

### Per-call context

The optional third argument supplies per-call identity/attributes. Per-call attributes win over everything else on key collision:

```ts
const checkout = useFlag('new_checkout', false, () => ({
  attributes: { cart_size: cart.items.length },
}));
```

### App-wide attributes (`bridge.attributes`)

For attributes that every flag evaluation should see — not just one call site — publish them once on the unified bridge surface:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.attributes.set('beta_cohort', true);                    // static value
bridge.attributes.bind('cart_size', () => cart.items.length); // re-read on every eval
bridge.attributes.bindMany(() => ({ theme, locale }));         // bulk getter
```

Precedence on key collision: per-call context > `bridge.attributes` > Bridge-managed providers. The `bridge:` namespace is reserved — writes to it are rejected with a console warning. See the Live Updates guide for the full `bridge.attributes` API.

### FeatureFlag component

Declarative gating with optional fallback content. The snippets receive the evaluated value:

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<FeatureFlag key="new_dashboard" defaultValue={false}>
  <NewDashboard />
</FeatureFlag>

<!-- With fallback for the non-matching case: -->
<FeatureFlag key="premium_feature" defaultValue={false}>
  {#snippet children(value)}
    <button>Use premium feature</button>
  {/snippet}
  {#snippet fallback(value)}
    <button disabled title="Upgrade to unlock">Premium (locked)</button>
  {/snippet}
</FeatureFlag>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `key` | `string` | **(required)** | The flag key |
| `defaultValue` | `T` | **(required)** | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | — | Per-call eval context (attributes win on collision) |
| `children` | snippet | — | Rendered when the flag passes; receives the value |
| `fallback` | snippet | — | Rendered when it doesn't; receives the value |

### flagStore — store-contract variant

For code that prefers the Svelte store contract (e.g. usage outside `.svelte` files):

```ts
import { flagStore } from '@nebulr-group/bridge-svelte/flags';

const banner = flagStore('show_banner', false);
const unsubscribe = banner.subscribe(({ value, passed }) => {
  // re-runs on every live flag change
});
```

### Multi-type values

One API for boolean, string, number, and JSON flags — the type is inferred from the default:

```ts
const isDark = useFlag('dark_mode', false);
const cta    = useFlag('checkout_text', 'Submit');
const limit  = useFlag('max_uploads', 10);
const cfg    = useFlag('rate_limit', { window: 60, max: 100 });
```

A type mismatch (admin stored a different type than your default suggests) returns the default and logs a warning.

### Identity & anonymous visitors

The SDK manages identity for you:

- On first load, it generates an anonymous ID and persists it (configurable: `persistent` localStorage / `session` sessionStorage / `none` in-memory) — anonymous visitors get stable bucketing for A/B tests and percentage rollouts.
- With Bridge auth enabled, the session identity is used automatically and pre-login activity is linked on login.

### Live connection status

```ts
import { realtimeStatus } from '@nebulr-group/bridge-svelte/flags';
// reactive ConnectionState: 'connecting' | 'open' | 'closed' …
```

When the live channel drops, flags freeze on last-known values and refetch on reconnect — your app keeps working through Bridge outages.

### Bridge-managed attributes

With Bridge auth and/or billing enabled, attributes like `bridge:user.role`, `bridge:tenant.plan`, and `bridge:billing.plan` merge into every evaluation automatically — no app code. Your own (dev-supplied) attributes always win on key collision, and the admin UI surfaces collisions on the flag detail page.

With billing enabled this includes quota and entitlement attributes (`bridge:billing.quota.<metric>.*`, `bridge:billing.entitlement.<name>`) — the recommended way to gate plan-granted features is a flag whose rule targets an entitlement attribute. See the Payments guide's Entitlements section for the pattern.

### Propagating context to your backend

If your backend also evaluates flags for the same user, forward the eval context so both sides agree on identity and bucketing. The SDK serializes the context into the `x-bridge-context` header; backend SDKs (e.g. `@nebulr-group/bridge-nestjs/flags` with `BridgeContextInterceptor`) pick it up automatically.

Only propagate identity and attributes the backend can't derive itself — never `role`/`plan`-style attributes (the backend reads those from its own verified sources).

### Route-level flags

Gate entire routes behind flags with `routeConfig` rules (unchanged from 1.x):

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

---

### Legacy (1.x) API

Apps on the pre-2.0 surface used `flagName`/`forceLive` props with a server-evaluated, cached model:

```svelte
<FeatureFlag flagName="new-dashboard" forceLive>…</FeatureFlag>
```

The 1.x props (`flagName`, `forceLive`, `negate`, `renderWhenDisabled`) and the bulk/live cache distinction are superseded by the local-eval model above — there is no cache staleness to bypass, because rule changes push live. The 1.x programmatic helpers (`featureFlags`, `isFeatureEnabled`, `loadFeatureFlags`) remain available for boolean flags during migration; prefer `useFlag`/`flagStore` for new code.
