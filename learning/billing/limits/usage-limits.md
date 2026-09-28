# Show usage limits in your app

Where an [entitlement](/billing/limits/lock-features/) is a yes/no switch, a **quota** is a metered allowance that a workspace (called a *tenant* in the API) can run down and hit: 10,000 AI calls a month, 20 seats. Quotas are **defined on the plan**; see [Define your plans](/billing/setup/define-plans/) for setting them. This page covers showing quota state in your app and reacting as usage climbs. To submit the usage that fills these quotas, see [Report usage](/billing/limits/report-usage/).

`<BridgeQuotaBanner>` warns users as they approach a metric's cap so a hard stop never comes as a surprise, and it nudges them to upgrade. It's a live usage banner for one metric, and its behavior depends on the quota's `policy`:

- **`hard`** caps — renders nothing while usage is below 80% of the plan's quota (or when the plan has no quota for that metric), shows a warning at 80–94%, critical at 95%+, and over-cap copy when the limit is exceeded.
- **`metered`** pricing — shows live usage and projected cost once billing engages (usage past the included allotment, or from unit 1 when the limit is 0). Metered banners are informational (never critical/blocking) and render copy like _"120 over your 1,000 included · ~$1.20 estimated this period"_ or, for pure per-unit pricing, _"4,200 api_calls · ~$42.00 estimated this period"_.

It updates live on `quota.updated` pushes.

```svelte
<script lang="ts">
  import { BridgeQuotaBanner } from '@nebulr-group/bridge-svelte';
</script>

<BridgeQuotaBanner metric="ai_completions" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `metric` | `string` | required | Metric key to watch |
| `label` | `string` | metric key | Humanized display label |
| `class` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(snap) => void` | (none) | Override the default Upgrade CTA handler (hard caps only) |

## When a workspace reaches its limit

**Your server decides; the UI explains.** The limit is enforced by your backend: with the NestJS SDK that is one decorator on the handler that creates the thing (`@RequireQuota('tickets')`), which refuses the request at the cap. Nothing in the browser can enforce a limit, because anyone can call your API directly. What the Svelte SDK does is make that refusal understandable, at three levels of effort.

### Level 0: no code

A page that calls your backend needs nothing for the limit:

```svelte
<script lang="ts">
  import { bridgeFetch } from '@nebulr-group/bridge-svelte';

  async function createTicket() {
    await bridgeFetch('/api/tickets', { method: 'POST' });
  }
</script>

<button onclick={createTicket}>New ticket</button>
```

When the backend refuses at the cap it answers `402` with `{ code: 'QUOTA_EXCEEDED', metric, used, limit, fix }`. `<BridgeBootstrap>` sees that answer and opens an **upgrade dialog**: *"This workspace has used 3 of 3 tickets on its current plan"*, with an **Upgrade plan** button that goes to `fix` (a path in your app) or else your subscription page. Your code still gets the `402` response, unchanged, to handle like any failed write.

The same dialog opens, in its feature variant (*"This feature isn't on your plan"*, naming the plans that include it), when a flag-gated endpoint answers `402 FEATURE_NOT_IN_PLAN`, when someone opens a route whose feature flag is off because of the plan, or when they click a `<FeatureFlag>` upgrade prompt. A page that merely renders a hidden feature never opens it. See [Show or hide UI](/feature-flags/using/show-hide-ui/).

Your app authenticates its own API calls with [`bridgeFetch`](/billing/limits/report-usage/) anyway: a plain `fetch` sends no user token, so a protected backend answers `401`, never `402`. The limit handling still needs no code — the dialog opens from any `402 QUOTA_EXCEEDED` the wrapper sees. A backend on another origin works the same way; list it in `billing.apiOrigins` if some calls to it go through plain `fetch`.

| Config (`billing` in `bridgeBootstrap({...})`) | Default | Description |
|------|---------|-------------|
| `upgradeDialog` | `true` | `false` turns the dialog off; a component replaces it (it receives `refusal`, `upgradeHref`, `canUpgrade`, `onclose`, and for a feature the plan doesn't include, `feature` and `plans`) |
| `apiOrigins` | `[]` | Other origins your backend answers from, e.g. `['https://api.example.com']` |
| `manageRoute` | `'/subscription'` | Where **Upgrade plan** goes when the refusal names no `fix` |

With the dialog off, `onBridgeQuotaExceeded((refusal) => …)` hands you the same refusal to show your own way.

### Level 1: one component

When the button should react *before* the click, wrap it in `<QuotaGate>`:

```svelte
<script lang="ts">
  import { QuotaGate } from '@nebulr-group/bridge-svelte';
</script>

<QuotaGate metric="tickets">
  <button onclick={createTicket}>New ticket</button>
  {#snippet atLimit(quota)}
    {quota.used} of {quota.limit} tickets used. <a href="/subscription">Upgrade</a>
  {/snippet}
</QuotaGate>
```

At a hard cap every button and input inside is disabled, and the `atLimit` snippet (or a default "You've used all … Upgrade" line) shows beside them. It **never** disables on a guess: while the quota is loading, when the plan sets no limit on the metric, and for `metered` quotas (which bill overage rather than block), the children stay enabled.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `metric` | `string` | required | Metric key to gate on |
| `atLimit` | `Snippet<[QuotaState]>` | "You've used all … Upgrade" | Shown beside the disabled children at the cap; receives the live quota |
| `class` | `string` | `''` | Class on the wrapper |

For a plan *feature* rather than a counted thing, use [`<Entitled>`](/billing/limits/lock-features/). Bridge turns every hard quota into an entitlement of the same name that is `false` at the cap, so don't wrap `<Entitled to="tickets">` around `<QuotaGate metric="tickets">`: at the cap it would hide the button and the upgrade line together.

### Level 2: your own UI

For a fully custom quota UI, `useQuota(metric)` gives you the numbers, live:

```svelte
<script lang="ts">
  import { useQuota } from '@nebulr-group/bridge-svelte';

  const projects = useQuota('projects');
</script>

{#if projects.loading}
  <Spinner />
{:else if projects.unlimited}
  Unlimited projects
{:else}
  {projects.used} of {projects.limit} projects · {projects.remaining} left
{/if}
```

| Field | Meaning |
|---|---|
| `loading` | `true` until Bridge answers. While loading, the numbers are `null`, never `0`, so a workspace at its cap never flashes "0 used". |
| `unlimited` | The plan puts no quota on this metric. |
| `used`, `limit`, `remaining` | The numbers. For a **counter**, `used` is this billing period's total. For a **gauge**, it's how many exist right now. |
| `warningLevel` | `'approaching'` from 80%, `'critical'` from 95%, otherwise `null`. |
| `kind` | `'counter'` or `'gauge'` (see below). |
| `snapshot` | The full quota: `policy` (`'hard'` or `'metered'`), plus for metered quotas `unitAmount`, `currency`, `overageEstimate` and `overcap`. |

It updates on its own when usage changes. When the metric key comes from a prop, pass a getter: `useQuota(() => metric)`.

### Counter or gauge?

If deleting it frees room, it's a gauge and your app counts it. If it happened, it's a counter and Bridge counts it.

- **Counter** (the default): AI completions, exports, API calls. Bridge sums what you [report](/billing/limits/report-usage/) and resets it each billing period: "40 of 100 this month".
- **Gauge**: projects, documents, seats. Your app tells Bridge how many exist right now, and the number never resets: "8 of 10 projects". Seats (`users`) are counted by Bridge from the workspace's members.

Set the kind on the plan's quota (`bridge plan quota set <plan> --metric projects --limit 10 --policy hard --kind gauge`).

> Showing a quota is display, not enforcement. The cap has to be checked where the write happens: your backend, which refuses the request (see [Check plans on your backend](/billing/advanced/backend-checks/)). The dialog, `<QuotaGate>` and `useQuota` only explain or anticipate that refusal.
