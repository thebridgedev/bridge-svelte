# Let users manage their billing

Send users to the Stripe billing portal to update their payment method, view invoices, or cancel:

```svelte
<script lang="ts">
  import { getBridgeAuth } from '@nebulr-group/bridge-svelte';

  async function openPortal() {
    const url = await getBridgeAuth().getPortalUrl();
    window.location.href = url;
  }
</script>

<button onclick={openPortal}>Manage billing</button>
```
