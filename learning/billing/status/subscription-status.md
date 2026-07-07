# Show subscription status

Renders the current plan name + a status badge. Mounts and subscribes itself — no props required.

```svelte
<script lang="ts">
  import { BridgeSubscriptionStatus } from '@nebulr-group/bridge-svelte';
</script>

<BridgeSubscriptionStatus />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `class` | `string` | `''` | Class applied to the root span |
