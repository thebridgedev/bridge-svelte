<!--
  TEST FIXTURE (TBP-756) — a page that renders a plan-gated feature twice:
    - with no fallback: hidden, and nothing opens (owner rule);
    - with the opt-in `upgrade` word: an inline prompt that opens the upgrade
      dialog only when clicked.
  And a link to a route whose rule requires the same flag (+layout rules:
  /feature-upgrade/gated → featureFlag e2e-plan-gated, redirectTo here).
  The flag is seeded by e2e/playwright/tests/feature-flags/feature-upgrade.spec.ts.
-->
<script lang="ts">
	import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<h1>Feature upgrade</h1>

<section data-testid="hidden-feature">
	<FeatureFlag key="e2e-plan-gated" defaultValue={false}>
		{#snippet children()}<p data-testid="hidden-feature-on">Reports</p>{/snippet}
	</FeatureFlag>
</section>

<section data-testid="prompted-feature">
	<FeatureFlag key="e2e-plan-gated" defaultValue={false} upgrade>
		{#snippet children()}<p data-testid="prompted-feature-on">Reports</p>{/snippet}
	</FeatureFlag>
</section>

<a href="/feature-upgrade/gated" data-testid="gated-link">Open the gated page</a>
