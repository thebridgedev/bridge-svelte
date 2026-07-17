# Warn about billing problems

The unified billing banner. Renders **nothing** while the subscription is healthy, and the right notice when it needs attention: trial countdown, payment failed, dunning (automated payment retries), cancellation, locked. Not dismissible; it disappears when the status flips back to healthy.

```svelte
<script lang="ts">
  import { BridgeBillingNotice } from '@nebulr-group/bridge-svelte';
</script>

<!-- Put it once in your root layout -->
<BridgeBillingNotice />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `chassis` | `'bar' \| 'rail' \| 'card'` | `'rail'` | Visual variant |
| `mode` | `'soft' \| 'hard'` | `'soft'` | `soft` always renders inline; `hard` renders a full-screen lockscreen when the workspace is billing-locked |
| `class` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(state) => void` | (none) | Override the default CTA click handler |

"Billing-locked" means the subscription of the workspace (called a *tenant* in the API) has lapsed, so the app should be gated; it's the `gateEngaged` flag on the subscription snapshot. See [How billing works](/billing/how-it-works/#when-billing-locks-the-app) for how the lock relates to the plan-selection gate.

States it covers: trial active, trial ending soon, past due, cancellation scheduled, canceled, dunning retry scheduled, final retry, exhausted (locked). Each state has two role variants: workspace admins get an action CTA ("Update card", "Upgrade"); members get an informational variant pointing them to their workspace owner.
