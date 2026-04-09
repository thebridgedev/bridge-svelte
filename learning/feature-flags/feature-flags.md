# Feature Flags

### Bulk vs live

Bridge provides two ways to check feature flags:

1. **Bulk (recommended)** — all flags are fetched once and cached for 5 minutes. The `FeatureFlag` component uses this by default.
2. **Live** — bypasses the cache and queries the API on each check. Use for flags that must reflect changes immediately.

### FeatureFlag component

**Basic usage** — renders children only when the flag is enabled:

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag flagName="new-dashboard">
  <p>The new dashboard is enabled!</p>
</FeatureFlag>
```

**Force live check:**

```svelte
<FeatureFlag flagName="new-dashboard" forceLive>
  <p>Live-checked flag is enabled</p>
</FeatureFlag>
```

**Conditional rendering (enabled/disabled)** — use `renderWhenDisabled` with the snippet API to render different content:

```svelte
<FeatureFlag flagName="premium-feature" renderWhenDisabled>
  {#snippet children({ enabled, rawEnabled })}
    {#if enabled}
      <button>Use premium feature</button>
    {:else}
      <button disabled title="Upgrade to unlock">
        Premium feature (locked)
      </button>
    {/if}
  {/snippet}
</FeatureFlag>
```

The snippet receives `{ enabled, rawEnabled }` where `enabled` respects the `negate` prop and `rawEnabled` is the raw API value.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flagName` | `string` | **(required)** | The feature flag key |
| `forceLive` | `boolean` | `false` | Bypass cache and check live |
| `negate` | `boolean` | `false` | Invert the flag value |
| `renderWhenDisabled` | `boolean` | `false` | Always render children (pass `enabled` via snippet) |

### Route-level flags

Gate entire routes behind feature flags using `routeConfig` rules:

**Single flag:**

```ts
const routeConfig: RouteGuardConfig = {
  rules: [
    { match: '/', public: true },
    { match: new RegExp('^/auth($|/)'), public: true },
    { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
    { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};
```

**`any` / `all` requirements:**

```ts
const routeConfig: RouteGuardConfig = {
  rules: [
    // Route allowed if ANY of the flags are enabled
    { match: '/labs/*', featureFlag: { any: ['labs-v1', 'labs-v2'] }, redirectTo: '/' },

    // Route allowed only if ALL flags are enabled
    { match: '/premium/*', featureFlag: { all: ['paid', 'kyc-verified'] }, redirectTo: '/upgrade' },

    { match: '/', public: true },
    { match: new RegExp('^/auth($|/)'), public: true },
  ],
  defaultAccess: 'protected',
};
```

**Global flag plus per-route criteria:**

The first matching rule wins. Place specific routes before the global catch-all:

```ts
const routeConfig: RouteGuardConfig = {
  rules: [
    // Specific route — its own criteria
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },

    // Public routes
    { match: '/', public: true },
    { match: new RegExp('^/auth($|/)'), public: true },

    // Global flag — requires 'app-enabled' for all other protected routes
    { match: '/*', featureFlag: 'app-enabled', redirectTo: '/maintenance' },
  ],
  defaultAccess: 'protected',
};
```

### Programmatic access

Access flags from JavaScript/TypeScript:

```ts
import { get } from 'svelte/store';
import { featureFlags, isFeatureEnabled, loadFeatureFlags } from '@nebulr-group/bridge-svelte';

// Load all flags (usually done automatically by bootstrap)
await loadFeatureFlags();

// Read the flags store (reactive)
const allFlags = get(featureFlags.flags); // Record<string, boolean>

// Check a single flag (cached)
const enabled = await isFeatureEnabled('my-flag');

// Check a single flag (live, bypasses cache)
const enabledLive = await isFeatureEnabled('my-flag', true);

// Refresh all flags
await featureFlags.refresh();
```

### Generic usage patterns

**Resource limits via flags:**

Use flags to represent plan capabilities and enforce limits:

```ts
// src/lib/services/usage.ts
import { get } from 'svelte/store';
import { featureFlags, profileStore } from '@nebulr-group/bridge-svelte';

const LIMIT_FLAGS = {
  UNLIMITED: 'limit-unlimited',
  LIMIT_50: 'limit-50',
};

export function getPlanLimit(): number {
  const flags = get(featureFlags.flags);
  if (flags[LIMIT_FLAGS.UNLIMITED]) return Infinity;
  if (flags[LIMIT_FLAGS.LIMIT_50]) return 50;
  return 5; // Free tier default
}
```

**Upgrade CTA when a flag is disabled:**

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag flagName="advanced-export" renderWhenDisabled>
  {#snippet children({ enabled })}
    {#if enabled}
      <button onclick={exportData}>Export data</button>
    {:else}
      <div class="upgrade-prompt">
        <p>Upgrade your plan to export data.</p>
        <a href="/subscription">View plans</a>
      </div>
    {/if}
  {/snippet}
</FeatureFlag>
```

**Gating a UI element with disabled state:**

```svelte
<FeatureFlag flagName="bulk-actions" renderWhenDisabled>
  {#snippet children({ enabled })}
    <button disabled={!enabled} title={enabled ? 'Run bulk action' : 'Upgrade to unlock'}>
      Bulk action
    </button>
  {/snippet}
</FeatureFlag>
```
