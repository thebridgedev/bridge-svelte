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

For a fully custom quota UI, read the underlying snapshot directly:

```ts
import { useBridge } from '@nebulr-group/bridge-auth-core';

const q = useBridge().quota('ai_completions');
// undefined while loading (first call triggers a fetch), then:
// q?.used, q?.limit, q?.remaining, q?.warningLevel ('approaching' | 'critical' | null)
// q?.policy ('hard' | 'metered')
// metered-only fields (present when policy === 'metered'):
//   q?.unitAmount      per-unit price (whole currency units, e.g. 0.01)
//   q?.currency        ISO currency of unitAmount / overageEstimate
//   q?.overageEstimate estimated overage cost this period
//   q?.overcap         true once billing engaged (past the allotment; limit 0 ⇒ used > 0)
```

> **Note:** this imports from the underlying `@nebulr-group/bridge-auth-core` package, not from `@nebulr-group/bridge-svelte`. It's a temporary escape hatch: the Svelte SDK doesn't yet expose quota state on the `bridge` object (and the `useBridge()` exported by `bridge-svelte` is a different function that returns the `bridge` object, without a `quota()` method). Until the SDK surfaces quotas, import the auth-core package directly for this one read.
