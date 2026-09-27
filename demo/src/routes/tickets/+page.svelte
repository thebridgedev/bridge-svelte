<!--
  Plan limits, levels 0 and 1. The stand-in backend (routes/api/demo-backend)
  refuses a new ticket with 402 QUOTA_EXCEEDED, as bridge-nestjs's
  @RequireQuota does at the cap, and Bridge opens the upgrade dialog: the page
  has no limit code. QuotaGate disables the button once the plan's cap is known.
-->
<script lang="ts">
  import { bridgeFetch, QuotaGate } from '@nebulr-group/bridge-svelte';

  const createTicket = () => bridgeFetch('/api/demo-backend/tickets', { method: 'POST' });
</script>

<h1>Tickets</h1>

<QuotaGate metric="tickets">
  <button onclick={createTicket}>New ticket</button>
</QuotaGate>
