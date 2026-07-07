# Set usage limits

A live usage-cap banner for one metric. Renders nothing while usage is below 80% of the plan's quota (or when the plan has no quota for that metric); shows a warning at 80–94%, critical at 95%+, and over-cap copy when the limit is exceeded. Updates live on `quota.updated` pushes.

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
| `onActionClick` | `(snap) => void` | — | Override the default Upgrade CTA handler |

For a fully custom quota UI, read the underlying snapshot directly:

```ts
import { useBridge } from '@nebulr-group/bridge-auth-core';

const q = useBridge().quota('ai_completions');
// q?.used, q?.limit, q?.remaining, q?.warningLevel ('approaching' | 'critical' | null)
```
