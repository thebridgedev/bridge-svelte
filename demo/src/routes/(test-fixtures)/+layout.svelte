<!--
  TEST FIXTURES ONLY. Everything under src/routes/(test-fixtures) exists for the
  e2e suite (and bridge-api's metered specs, which drive this demo too): probes,
  harnesses and the pages that prove each customisation level. The group adds
  nothing to the URL. The reference integration is everything outside it.
-->
<script lang="ts">
  import '$lib/test-fixtures/fixture-tokens.css';
  import '$lib/test-fixtures/fixture-styles.css';

  let { children } = $props();
</script>

{@render children()}
