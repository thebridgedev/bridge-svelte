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

## The standard pattern: the plan lists it, a flag reads it

Every gate in app code is a flag. A feature a plan sells is two pieces:

1. **The plan lists the feature.** `bridge plan feature add pro ai_completions --name "AI"` (MCP: `add_plan_feature`). The pricing table and the upgrade dialog name it from the same list.
2. **A flag reads that list.** Create a flag (e.g. `use_ai`) whose rule is `bridge:billing.entitlement.ai_completions eq true`:

```json
{ "branches": [{ "conditions": [{ "attribute": "bridge:billing.entitlement.ai_completions", "operator": "eq", "values": [true] }], "returnValue": true }],
  "otherwiseValue": false, "rolloutPct": 100 }
```

Then gate on the flag:

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<FeatureFlag key="use_ai" defaultValue={false} upgrade>
  <AiPanel />
</FeatureFlag>
```

With `upgrade`, a workspace whose plan is why it is off sees an "Upgrade to use this" button that opens the upgrade dialog, naming the plans that include it. For your own prompt, pass a `fallback(value, { reason, openUpgrade })` snippet; `reason` is `'plan'` when an upgrade alone would turn it on. A whole page is a route rule: `{ match: '/ai/*', featureFlag: 'use_ai', redirectTo: '/' }`. In script, `useFlag('use_ai', false)`. On a NestJS backend, `@RequireFeatureFlag('use_ai')` reads the same rule.

You get the best of both: the **plan** supplies eligibility (and stays correct across plan renames or a bespoke grant to one enterprise customer), while the **flag** adds everything flags give you *on top*: percentage rollouts within a plan, an instant kill switch, per-segment overrides, all without a code change. The rule never names plans, so changing what Pro sells is one edit on the plan and no flag rule has to follow. See [Target by plan or role](/feature-flags/targeting/by-plan-or-role/) for the full list of `bridge:billing.*` targeting attributes.

It's live: when the workspace upgrades, `entitlements.changed` arrives and the flag re-evaluates on its own.

> Bridge also turns every hard [quota](/billing/limits/usage-limits/) into an entitlement of the same name, `false` once the cap is reached. Plan features (`sso`, `analytics`) are flags; counted things (`tickets`, `projects`) are `<QuotaGate>`. Never rule a flag on a counted metric's entitlement and wrap it around a `<QuotaGate>` for the same metric: at the cap it would hide the button and the upgrade line together.

> Entitlements are **billing-derived** (what the plan grants the workspace). Who-may-do-what inside a workspace is a flag ruled on a privilege; see [Gate features by role or privilege](/auth/roles/gate-with-flags/).

## Exceptions: checking the plan directly

When the developer explicitly asks for no flag, `<Entitled to="ai_completions">` (markup) and `$entitlements.can('ai_completions')` (script) read the plan's list directly; `bridge.tenant.entitlements.can(key)` is the same answer outside a component. Both are fail-closed (`false` until Bridge has answered, `$entitlements.ready` tells the two apart), and in development the first one on a page logs a one-time note pointing at the flag rule.

```svelte
<Entitled to="ai_completions">
  <AiPanel />
  {#snippet fallback()}<UpgradePrompt />{/snippet}
</Entitled>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `to` | `string` | required | Entitlement key |
| `fallback` | `Snippet` | nothing | Shown when the plan doesn't grant `to` |
| `loading` | `Snippet` | nothing | Shown until Bridge has answered |
