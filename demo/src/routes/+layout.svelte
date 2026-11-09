<script lang="ts">
	import '@nebulr-group/bridge-svelte/styles';
	import '../app.css';
	import { BridgeBootstrap, BillingNotice } from '@nebulr-group/bridge-svelte';
	import Nav from '$lib/Nav.svelte';

	let { children } = $props();
</script>

<BridgeBootstrap>
	<Nav />
	<BillingNotice />
	<main>{@render children()}</main>
</BridgeBootstrap>
