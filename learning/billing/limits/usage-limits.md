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

## Reading quota state yourself

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

> Showing a quota is display, not enforcement. The cap has to be checked where the write happens: your backend, which reads the same quota and refuses the request.
