# Lock features to a plan

This is where Bridge billing pays off in your UI: gate a premium feature on the plan, and the moment a workspace (called a *tenant* in the API) upgrades, the feature **unlocks live**. No reload, no re-login, no polling. Plans grant **entitlements**, named capabilities like `ai_completions` or `sso`, that arrive with the session snapshot and are replaced wholesale on every `entitlements.changed` push. Because it's the same live channel (a persistent realtime connection the SDK maintains) that drives the rest of the `bridge` object, any open tab with a live connection stays in sync.

## What's an entitlement, and how is it different from a feature flag?

If you already use [feature flags](/feature-flags/), this is the first question you'll ask, because both gate features. The short answer: they work at different layers and are best used **together**.

An **entitlement** is *billing truth*: "does this workspace's **plan** grant capability X?" Bridge computes it from the subscription. It's a piece of live **data**, not a targeting engine. You don't configure who gets it or roll it out gradually; it's simply whatever the plan says, and it changes only when the plan changes.

A **feature flag** is *your control surface*: a switch you own in Control Center (your admin dashboard at app.thebridge.dev) with arbitrary targeting (percentage, role, cohort, kill switch), independent of billing. It's a decision **engine**.

| | Entitlement | Feature flag |
|---|---|---|
| What it is | **Data**: "what did they pay for?" | **Engine**: "what do I switch on, for whom, now?" |
| Who sets it | Billing (the plan definition) | You, in Control Center |
| Configurable per-user / rollout? | No, it's whatever the plan grants | Yes: %, role, cohort, kill switch |
| Changes when | The subscription changes | You change the rule |
| Answers | **Eligibility** | **Exposure** |

One line to remember: **an entitlement is what they bought; a feature flag is what you choose to switch on.** They aren't competitors. An entitlement is a clean, billing-maintained *signal*, and a flag is an engine that can *read* that signal. That's the recommended pattern.

## The standard pattern: a flag targeting the entitlement

Gate the feature on a **feature flag** whose rule targets the entitlement (`bridge:billing.entitlement.<name>`), rather than checking the entitlement directly. Create a flag (e.g. `use_ai`) with a rule targeting `bridge:billing.entitlement.ai_completions`, then gate on the flag:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const useAi = useFlag('use_ai', false);
</script>

{#if useAi.value}<AiPanel />{/if}
```

You get the best of both: the **entitlement** supplies plan eligibility (and stays correct across plan renames or a bespoke grant to one enterprise customer), while the **flag** adds everything flags give you *on top*: percentage rollouts within a plan, an instant kill switch, per-segment overrides, all without a code change. See the [Feature Flags → Target by plan or role](/feature-flags/targeting/by-plan-or-role/) guide for the full list of `bridge:billing.*` targeting attributes (plan, subscription status, quotas, entitlements).

## Using entitlements standalone

Not using Bridge feature flags? Gate directly on the entitlement. It's simpler; you just lose the operational control (rollout %, kill switch, experiments) a flag would add on top.

Read the reactive snapshot in your markup:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const entitlements = bridge.tenant.entitlements.snapshot;
</script>

{#if $entitlements?.ai_completions}
  <AiPanel />
{/if}
```

Or check imperatively (synchronous, fail-closed: `false` until the snapshot lands):

```ts
if (bridge.tenant.entitlements.can('ai_completions')) { /* ... */ }
```

Either way it's live: when the workspace upgrades, `entitlements.changed` replaces the snapshot and your gate re-evaluates on its own.

> Entitlements are **billing-derived** (what the plan grants the workspace). They are not roles: use Bridge's role/privilege system for who-may-do-what inside a workspace.
