<!--
  FF 2.0 release-validation — discovery probe route (TBP-241 Phase 1.5).

  Reads a `?key=` URL param and references that flag via `useFlag(key, false)`.
  This lets Playwright dynamically reference a flag key the SDK has never
  seen so it triggers the SDK's discover-flow on the bridge-api side.

  Page renders a single observable indicator:
    [data-testid="probe-state"]   — text "active" or "fallback"
    [data-testid="probe-key"]     — the resolved flag key (for sanity)

  See scenarios-gaps.md (#1) for why this exists.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { useFlag } from '@bridge-svelte/lib/flags';

  const flagKey = $derived((page.url.searchParams.get('key') ?? '').trim());
  const flag = useFlag<boolean>(() => flagKey, false);
  const state = $derived(flag.value ? 'active' : 'fallback');
</script>

<section>
  <h1>FF 2.0 discovery probe</h1>
  <p>
    Resolved flag key:
    <strong data-testid="probe-key">{flagKey || '(none)'}</strong>
  </p>
  <p>
    State: <strong data-testid="probe-state">{state}</strong>
  </p>
</section>
