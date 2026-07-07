# Lock features to a plan

Plans grant **entitlements** — named capabilities like `ai_completions` or `sso`. They arrive with the session snapshot and are replaced wholesale on every `entitlements.changed` push, so an upgrade unlocks features live.

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const entitlements = bridge.tenant.entitlements.snapshot;
</script>

{#if $entitlements?.ai_completions}
  <AiPanel />
{/if}
```

Imperative check (synchronous, fail-closed — `false` until the snapshot lands):

```ts
if (bridge.tenant.entitlements.can('ai_completions')) { /* ... */ }
```

**The recommended gating pattern is a feature flag**, not a raw conditional. Create a flag (e.g. `use_ai`) with a rule targeting `bridge:billing.entitlement.ai_completions`, then gate on the flag:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const useAi = useFlag('use_ai', false);
</script>

{#if useAi.value}<AiPanel />{/if}
```

This gives you everything flags give you on top of the entitlement — percentage rollouts within a plan, kill switches, per-segment overrides — without code changes. The raw `entitlements.can()` conditional is the right tool when you aren't using feature flags. See the Feature Flags guide for the full list of `bridge:billing.*` targeting attributes (plan, subscription status, quotas, entitlements).

> Entitlements are **billing-derived** (what the plan grants the workspace). They are not roles — use Bridge's role/privilege system for who-may-do-what inside a workspace.
