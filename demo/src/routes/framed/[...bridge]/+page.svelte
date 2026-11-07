<!-- Rung 2: the app's frame and headings around every Bridge auth page. -->
<script lang="ts">
	import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes>
	{#snippet frame(page, form)}
		<div class="frame" data-testid="frame" data-page={page}>
			<aside class="frame-brand">Helpdesk</aside>
			<div class="frame-form">{@render form()}</div>
		</div>
	{/snippet}
	{#snippet heading(page)}
		<h2 class="frame-heading" data-testid="frame-heading">{page === 'sign-in' ? 'Back to your desk' : 'Helpdesk'}</h2>
	{/snippet}
</BridgeAuthRoutes>

<style>
	.frame {
		display: grid;
		grid-template-columns: 12rem 1fr;
		gap: 2rem;
		padding: 2rem;
	}
	.frame-brand {
		font-weight: 700;
		color: var(--app-accent);
	}
</style>
