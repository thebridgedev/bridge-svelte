# Live Updates & the Bridge Surface

Every Bridge app holds one live channel to the platform. On connect (and on every reconnect) the server pushes a `session.snapshot` with everything your UI needs — branding, workspace, subscription, entitlements, user — and after that, targeted pushes keep it current: flag changes, plan changes, payment events, quota updates. No polling, no refresh.

The **`bridge` surface** is the single object that exposes all of it, grouped by scope:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const branding = bridge.app.branding;
  const workspace = bridge.tenant.name;
  const subscription = bridge.tenant.subscription;
  const user = bridge.user;
</script>

{#if $branding}<img src={$branding.logo} alt={$branding.name} />{/if}
<p>Workspace: {$workspace}</p>
<p>Plan: {$subscription?.plan.name}</p>
<p>Signed in as {$user?.email}</p>
```

Every slice is a Svelte readable store. They are `null` until the channel delivers the first snapshot — gate on null for skeletons, or fall back to defaults. The `bridge` object's identity is stable; destructure and pass sub-references freely.

### The scopes

| Path | Type | What it holds |
|------|------|---------------|
| `bridge.app.branding` | `Readable<BrandingSnapshot \| null>` | Whitelabel branding: `logo`, `name`, colors, font |
| `bridge.app.plans` | lazy slice | Full plan catalog — `await bridge.app.plans` fetches on first access |
| `bridge.tenant.id` / `.name` | `Readable<string \| null>` | Current workspace identity |
| `bridge.tenant.subscription` | `Readable<SubscriptionSnapshot \| null>` | Canonical plan + status + endsAt (see the Payments guide) |
| `bridge.tenant.entitlements` | `snapshot` store + `can(key)` | Plan-granted capabilities, replaced live on change |
| `bridge.user` | `Readable<UserSnapshot \| null>` | Authenticated user: `id`, `email`, `role`, `tenantId` |
| `bridge.attributes` | write surface | Publish your own attributes into flag targeting (below) |
| `bridge.events` | dispatcher | Subscribe to every live channel event (below) |

### Handling live events

`bridge.events.handle({...})` is the one API for reacting to channel events — use it for side effects like analytics, audit logging, or alerting (UI state updates automatically through the stores above and the drop-in components):

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

const unsubscribe = bridge.events.handle({
  'flag.updated':              (m) => console.log('flag changed:', m.flag.key),
  'subscription.plan_changed': (m) => analytics.track('plan_changed', m),
  'quota.updated':             (m) => updateMeter(m.metric, m.remaining),
  'session.snapshot':          (m) => analytics.track('hydrated'),
  '*':                         (m) => debugLog(m.kind, m),
});

// later — one call removes every handler registered above
unsubscribe();
```

Event kinds:

- **Flags:** `flag.updated`, `flag.removed`
- **Session:** `session.snapshot`, `user.state_changed`
- **Subscription:** `subscription.plan_changed`, `subscription.created` / `updated` / `canceled` / `reactivated`, `subscription.trial_started` / `trial_ending_soon` / `trial_converted` / `trial_expired`
- **Payments:** `payment.succeeded`, `payment.failed`, `dunning.entered` / `retry_scheduled` / `recovered` / `exhausted`
- **Quotas & entitlements:** `quota.updated`, `entitlements.changed`

Semantics worth knowing:

- **Multiple handlers per kind** — every registered handler fires; registering is additive across your app.
- **`'*'` is a fallback**, not a firehose: it fires only for kinds that have no specific handler registered (so you never double-handle).
- **Errors are isolated** — one throwing handler doesn't block the others or break the dispatch loop.

### Publishing your own attributes

`bridge.attributes` is the write surface for feeding your own data into feature-flag targeting. Keys you publish here are usable in flag rules immediately and win over Bridge-managed attributes on collision:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

// Static value
bridge.attributes.set('beta_cohort', true);

// Live-bound — the getter re-runs on every flag evaluation
bridge.attributes.bind('cart_size', () => cart.items.length);

// Bulk — one getter returning a whole map
bridge.attributes.bindMany(() => ({
  theme: currentTheme,
  locale: navigator.language,
}));

// Read the merged map / remove keys
bridge.attributes.get();
bridge.attributes.unset('beta_cohort');
```

The `bridge:` namespace is reserved for Bridge-managed attributes — writes to it are rejected with a console warning. Pass `{ observed: false }` to `set`/`bind`/`bindMany` to keep a key out of attribute-discovery telemetry.

### Connection status

The channel's connection state is exposed as a store from the flags entry point:

```svelte
<script lang="ts">
  import { realtimeStatus } from '@nebulr-group/bridge-svelte/flags';
</script>

{#if $realtimeStatus !== 'open'}
  <span class="badge">reconnecting…</span>
{/if}
```

While the channel is down, everything keeps working from the last known state — flags evaluate from cache, stores hold their last snapshot. On reconnect the server re-sends a full `session.snapshot`, so every slice updates atomically and nothing is missed.

### Relationship to the module-level stores

The `bridge` surface and the original module-level stores (`appConfigStore`, `subscriptionStore`, `profileStore`, `isAuthenticated`, ...) are both supported and fed by the same internal state. The `bridge` surface is the newer, scoped way to read live platform state; the module-level stores remain the API for auth state and the classic checkout flow — see the Auth and Payments guides. Use whichever fits; they don't conflict.
