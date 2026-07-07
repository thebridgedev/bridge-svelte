# Require a plan to use the app

A hard gate for workspaces that haven't picked a plan yet. While `shouldSelectPlan` is true it renders a full-screen modal with a `<PlanSelector>` inside; otherwise it renders its children.

```svelte
<script lang="ts">
  import { BridgePaywall } from '@nebulr-group/bridge-svelte';
</script>

<BridgePaywall successRedirect="/welcome" cancelRedirect="/plans">
  <!-- your app — only rendered once a plan is active -->
  <slot />
</BridgePaywall>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `onSelect` | `({ plan, price }) => void` | — | Called after free-plan selection or a direct plan change |
| `heading` | `Snippet` | "Choose a plan" | Override the modal heading |

Workspaces with `paymentsAutoRedirect: false` are exempt from the gate.
