# Bridge SvelteKit — Feature Flags

You are adding feature flag support to a SvelteKit application that uses The Bridge.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:
1. `@nebulr-group/bridge-svelte` is in package.json dependencies
2. `src/routes/+layout.ts` calls `bridgeBootstrap()` with a `BridgeConfig` and `RouteGuardConfig`
3. `src/routes/+layout.svelte` renders `<BridgeBootstrap>`
4. `VITE_BRIDGE_APP_ID` is set in `.env`

If any are missing, run `bridge guide svelte` first to complete the initial setup.

## Using the FeatureFlag component

Import `FeatureFlag` from `@nebulr-group/bridge-svelte` and wrap content that should only render when a flag is enabled:

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag flagName="new-dashboard">
  <p>The new dashboard is enabled!</p>
</FeatureFlag>
```

To bypass the 5-minute bulk cache and check the flag live on every render, add `forceLive`:

```svelte
<FeatureFlag flagName="new-dashboard" forceLive>
  <p>Live-checked flag is enabled</p>
</FeatureFlag>
```

To render different content based on whether the flag is enabled or disabled, use `renderWhenDisabled` with the snippet API:

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

**Props reference:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flagName` | `string` | **(required)** | The feature flag key |
| `forceLive` | `boolean` | `false` | Bypass cache and check live |
| `negate` | `boolean` | `false` | Invert the flag value |
| `renderWhenDisabled` | `boolean` | `false` | Always render children (pass `enabled` via snippet) |

## Route-level feature gating

Gate entire routes behind feature flags by adding `featureFlag` rules to the existing `RouteGuardConfig` in `src/routes/+layout.ts`. Open the file and add rules to the `rules` array:

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

Import `RouteGuardConfig` if not already imported:

```ts
import type { BridgeConfig, RouteGuardConfig } from '@nebulr-group/bridge-svelte';
```

## Programmatic flag access

Access flags from JavaScript/TypeScript when you need to check them outside of templates:

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

**Example: resource limits via flags:**

```ts
// src/lib/services/usage.ts
import { get } from 'svelte/store';
import { featureFlags } from '@nebulr-group/bridge-svelte';

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

**Example: upgrade CTA when a flag is disabled:**

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

## Verify

1. Create a test flag in the Bridge dashboard (or via `bridge flag create test-flag`)
2. Add `<FeatureFlag flagName="test-flag">` to a page and confirm the content appears when the flag is enabled
3. Disable the flag and confirm the content disappears
4. If using `renderWhenDisabled`, confirm both branches render correctly
5. If using route-level gating, navigate to the gated route with the flag disabled and verify the redirect works
6. Run the project's build command to confirm no TypeScript or import errors
