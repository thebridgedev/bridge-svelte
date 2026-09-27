<!--
  TBP-702 — <BridgeBillingRoutes> restyled with its `frame` and `heading`
  snippets, mounted somewhere other than /subscription. The e2e suite uses it to
  prove the snippets and that links between the pages follow the catch-all.
-->
<script lang="ts">
  import { BridgeBillingRoutes } from '@bridge-svelte/lib/index';
</script>

<BridgeBillingRoutes>
  {#snippet frame(page, content)}
    <section class="framed" data-testid="billing-frame" data-page={page}>
      {@render content()}
    </section>
  {/snippet}
  {#snippet heading(page)}
    <h2 class="framed-heading" data-testid="billing-heading">Billing · {page}</h2>
  {/snippet}
</BridgeBillingRoutes>

<style>
  .framed {
    max-width: 48rem;
    margin: 2rem auto;
    padding: 1.5rem;
    border: 2px dashed #6366f1;
    border-radius: 12px;
  }
  .framed-heading {
    margin: 0 0 1rem;
    color: #4338ca;
  }
</style>
