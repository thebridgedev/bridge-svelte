# Show subscription status

A small, at-a-glance indicator of where the workspace's subscription stands — the current plan name plus a status badge (trial, active, past due, canceled). Handy in a nav bar, account menu, or settings header so users always know their billing state. It mounts and subscribes itself — no props, no wiring.

```svelte
<script lang="ts">
  import { BridgeSubscriptionStatus } from '@nebulr-group/bridge-svelte';
</script>

<BridgeSubscriptionStatus />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `class` | `string` | `''` | Class applied to the root span |
