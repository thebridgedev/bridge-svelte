<!--
  Demo route for TBP-178 — exercises the "dev passes per-call attributes to
  flag evaluation" code path end-to-end.

  Why this exists: the public Svelte wrappers (<FeatureFlag>, useFlag(),
  evaluateFlag()) DO NOT accept per-call attributes. Only the underlying
  auth-core BridgeFlags.flag(key, default, { attributes }) does.

  Until the Svelte plugin wrappers are extended to forward `attributes`,
  callers who need per-call context must reach for the raw instance via
  getBridgeFlagsInstance(). This page demonstrates exactly that — and
  Playwright uses it to verify the chain:

    bridge.flag(key, default, { attributes: { plan: 'enterprise' } })
      → effectiveCtx = { ...global.attrs, ...perCall.attrs }   (dev wins)
      → evaluateRule(rule, key, effectiveCtx)
      → returnValue or otherwiseValue

  The test flag is upserted directly into the SDK cache on mount, so we
  don't depend on realtime hydrate from bridge-api. That keeps the test
  hermetic — it exercises the SDK plumbing, not the admin-API → realtime →
  client wire.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getBridgeFlagsInstance } from '@bridge-svelte/lib/flags/registry.js';

  const FLAG_KEY = 'enterprise-feature';

  let result = $state<string>('idle');
  let lastPlan = $state<string>('(unset)');
  let cacheReady = $state(false);
  let cacheError = $state<string | null>(null);

  // Seed the SDK cache with our test flag. The rule says:
  //   plan == 'enterprise' → true
  //   otherwise            → false
  // rolloutPct = 100 so we don't need an identity for bucketing.
  function seedFlag(): boolean {
    const bridge = getBridgeFlagsInstance();
    if (!bridge) return false;
    bridge.upsert({
      key: FLAG_KEY,
      state: 'on-with-rule',
      valueType: 'boolean',
      offValue: false,
      onValue: true,
      rule: {
        branches: [
          {
            conditions: [
              {
                attribute: 'plan',
                operator: 'eq',
                values: ['enterprise'],
              },
            ],
            returnValue: true,
          },
        ],
        otherwiseValue: false,
        rolloutPct: 100,
      },
    });
    return true;
  }

  onMount(() => {
    // Poll briefly because createBridgeFlags runs in the +layout effect —
    // it may not have registered the instance yet at the moment this page
    // mounts. Bail after ~2s and surface the error in the UI.
    let tries = 0;
    const handle = setInterval(() => {
      tries++;
      try {
        if (seedFlag()) {
          cacheReady = true;
          clearInterval(handle);
        } else if (tries > 40) {
          cacheError = 'BridgeFlags instance never registered';
          clearInterval(handle);
        }
      } catch (err: any) {
        cacheError = err?.message ?? String(err);
        clearInterval(handle);
      }
    }, 50);
  });

  function evaluateWithPlan(plan: string) {
    lastPlan = plan;
    const bridge = getBridgeFlagsInstance();
    if (!bridge) {
      result = 'error:no-instance';
      return;
    }
    // Per-call attributes. This is the API surface TBP-178 is about.
    // auth-core 0.4.0-beta.10+ returns FlagEvalResult<T> = { passed, value };
    // extract .value to render the boolean the page expects.
    const { value } = bridge.flag<boolean>(FLAG_KEY, false, {
      attributes: { plan },
    });
    result = String(value);
  }
</script>

<section class="container">
  <h1>Flag context demo (TBP-178)</h1>
  <p>
    Exercises <code>bridge.flag(key, default, &#123; attributes &#125;)</code>
    directly. The flag <code>{FLAG_KEY}</code> is seeded locally with a rule
    that returns <code>true</code> when <code>plan == 'enterprise'</code>.
  </p>

  <p>
    Cache state:
    <span data-testid="cache-ready">{cacheReady ? 'ready' : 'pending'}</span>
    {#if cacheError}
      <span data-testid="cache-error" style="color: crimson">
        ({cacheError})
      </span>
    {/if}
  </p>

  <div class="buttons">
    <button
      type="button"
      data-testid="eval-enterprise"
      onclick={() => evaluateWithPlan('enterprise')}
      disabled={!cacheReady}
    >
      Evaluate with plan=enterprise
    </button>
    <button
      type="button"
      data-testid="eval-pro"
      onclick={() => evaluateWithPlan('pro')}
      disabled={!cacheReady}
    >
      Evaluate with plan=pro
    </button>
    <button
      type="button"
      data-testid="eval-free"
      onclick={() => evaluateWithPlan('free')}
      disabled={!cacheReady}
    >
      Evaluate with plan=free
    </button>
  </div>

  <div class="result">
    <p>
      Last plan attribute:
      <strong data-testid="last-plan">{lastPlan}</strong>
    </p>
    <p>
      Flag result:
      <strong data-testid="flag-result">{result}</strong>
    </p>
  </div>
</section>

<style>
  .container {
    max-width: 640px;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: system-ui, sans-serif;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  button {
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .result {
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 6px;
  }
  code {
    background: #eee;
    padding: 0 4px;
    border-radius: 3px;
  }
</style>
