<!--
  TBP-702 — the optional onboarding page. `billing: { paywallRoute: '/welcome' }`
  in +layout.ts sends plan-less workspaces here instead of /subscription/plan.
-->
<script lang="ts">
  import { BridgePaywallPage } from '@bridge-svelte/lib/index';
</script>

<BridgePaywallPage heading="Pick a plan to get started" />
