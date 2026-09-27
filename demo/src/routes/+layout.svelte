<script lang="ts">
  import '@nebulr-group/bridge-svelte/styles';
  import '../app.css';
  import { BridgeBootstrap, BridgeBillingNotice } from '@nebulr-group/bridge-svelte';
  import Nav from '$lib/Nav.svelte';
  // Demo-only: hooks the e2e suite reads in DEBUG builds.
  import TestHooks, { testBootstrapProps } from '$lib/test-fixtures/TestHooks.svelte';

  let { children } = $props();
</script>

<BridgeBootstrap {...testBootstrapProps}>
  <Nav />
  <BridgeBillingNotice />
  <main>{@render children()}</main>
</BridgeBootstrap>
<TestHooks />
