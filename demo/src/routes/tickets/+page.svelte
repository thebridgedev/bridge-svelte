<!--
  Calling the app's own API with the person's token, counting usage on the
  server, and what the browser does when the API refuses at a plan limit.
-->
<script lang="ts">
	import { bridgeFetch, FeatureFlag, QuotaBanner } from '@nebulr-group/bridge-svelte';

	let result = $state<string | null>(null);

	async function createTicket() {
		const response = await bridgeFetch('/api/tickets', { method: 'POST' });
		result = response.ok ? 'Ticket created.' : `Refused: ${response.status}`;
	}

	async function exportTickets() {
		// The API answers 402 at the plan's limit; bridgeFetch opens the upgrade dialog.
		const response = await bridgeFetch('/api/exports', { method: 'POST' });
		result = response.ok ? 'Exported.' : `Refused: ${response.status}`;
	}
</script>

<h1>Tickets</h1>
<QuotaBanner metric="tickets" />
<p>
	<button class="bridge-btn bridge-btn-primary" data-testid="new-ticket" onclick={createTicket}>New ticket</button>
	<button class="bridge-btn bridge-btn-secondary" data-testid="export" onclick={exportTickets}>Export</button>
</p>
{#if result}<p data-testid="ticket-result">{result}</p>{/if}

<FeatureFlag key="pdf-export" upgrade>
	<button class="bridge-btn bridge-btn-secondary" data-testid="pdf-export">Export as PDF</button>
</FeatureFlag>
