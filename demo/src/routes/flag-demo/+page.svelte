<script lang="ts">
  import FeatureFlag from '@bridge-svelte/lib/flags/FeatureFlag.svelte';

  let plan = $state<'enterprise' | 'pro' | 'free'>('enterprise');
</script>

<div class="page">
  <div class="container">
    <h1 class="heading-xl">Feature Flags</h1>
    <p class="text-lead">
      Three ways to use feature flags in your app. Each example below is live — changes you make in
      the admin UI propagate here without a page refresh.
    </p>

    <!-- ── A: Simple toggle ─────────────────────────────────────────────── -->
    <section class="demo-section">
      <div class="demo-header">
        <span class="demo-label">A</span>
        <h2 class="heading-lg">Simple on/off flag</h2>
      </div>
      <p class="demo-description">
        The most basic flag — no rules, just an on/off switch. You control it entirely from the
        admin UI.
      </p>

      <div class="setup-box">
        <p class="setup-title">How to try this</p>
        <ol>
          <li>Open <strong>Feature Control</strong> in the admin UI — <code>simple-flag</code> appears automatically.</li>
          <li>Toggle it on — the box below changes instantly.</li>
          <li>Toggle it off — it reverts.</li>
        </ol>
      </div>

      <div class="demo-output">
        <FeatureFlag key="simple-flag" defaultValue={false}>
          {#snippet children(_value)}
            <div class="flag-result flag-result--on" data-testid="simple-flag-on">
              ✅ <strong>simple-flag</strong> is <strong>ON</strong>
            </div>
          {/snippet}
          {#snippet fallback(_value)}
            <div class="flag-result flag-result--off" data-testid="simple-flag-off">
              ⬜ <strong>simple-flag</strong> is <strong>OFF</strong> — create or enable it in admin
            </div>
          {/snippet}
        </FeatureFlag>
      </div>
    </section>

    <!-- ── B: Rule-based flag ────────────────────────────────────────────── -->
    <section class="demo-section">
      <div class="demo-header">
        <span class="demo-label">B</span>
        <h2 class="heading-lg">Rule-based flag</h2>
      </div>
      <p class="demo-description">
        Flags can evaluate against attributes the server already knows — like the authenticated
        user's role. No code changes needed to react to rule updates.
      </p>

      <div class="setup-box">
        <p class="setup-title">How to try this</p>
        <ol>
          <li>Open <strong>Feature Control</strong> — <code>role-flag</code> appears automatically.</li>
          <li>Add a rule: <code>user.role</code> <strong>is</strong> <code>OWNER</code> → <strong>true</strong>.</li>
          <li>If your account's role is OWNER the box turns green immediately.</li>
          <li>Change the rule to a different role — it flips back.</li>
        </ol>
      </div>

      <div class="demo-output">
        <FeatureFlag key="role-flag" defaultValue={false}>
          {#snippet children(_value)}
            <div class="flag-result flag-result--on" data-testid="role-flag-on">
              ✅ <strong>role-flag</strong> matched — your role satisfies the rule
            </div>
          {/snippet}
          {#snippet fallback(_value)}
            <div class="flag-result flag-result--off" data-testid="role-flag-off">
              ⬜ <strong>role-flag</strong> did not match — create it with a role rule in admin
            </div>
          {/snippet}
        </FeatureFlag>
      </div>
    </section>

    <!-- ── C: Client-supplied context ────────────────────────────────────── -->
    <section class="demo-section">
      <div class="demo-header">
        <span class="demo-label">C</span>
        <h2 class="heading-lg">Flag with client-sent context</h2>
      </div>
      <p class="demo-description">
        Your app can pass extra attributes at evaluation time — things the server doesn't know
        about, like a locally-selected plan or a UI state. These override any server-side value for
        the same key.
      </p>

      <div class="setup-box">
        <p class="setup-title">How to try this</p>
        <ol>
          <li>Open <strong>Feature Control</strong> — <code>plan-flag</code> appears automatically.</li>
          <li>Add a rule: <code>plan</code> <strong>is</strong> <code>enterprise</code> → <strong>true</strong>.</li>
          <li>Use the selector below to change the <code>plan</code> attribute sent from this page.</li>
          <li>
            Switching to <code>enterprise</code> turns the flag on; any other value turns it off —
            without touching the admin UI.
          </li>
        </ol>
      </div>

      <div class="demo-controls">
        <label class="control-label">
          <span>Send <code>plan</code> attribute:</span>
          <select bind:value={plan} data-testid="plan-select">
            <option value="enterprise">enterprise</option>
            <option value="pro">pro</option>
            <option value="free">free</option>
          </select>
        </label>
      </div>

      <div class="demo-output">
        <FeatureFlag key="plan-flag" defaultValue={false} context={{ attributes: { plan } }}>
          {#snippet children(_value)}
            <div class="flag-result flag-result--on" data-testid="plan-flag-on">
              ✅ <strong>plan-flag</strong> matched — <code>plan = {plan}</code> satisfies the rule
            </div>
          {/snippet}
          {#snippet fallback(_value)}
            <div class="flag-result flag-result--off" data-testid="plan-flag-off">
              ⬜ <strong>plan-flag</strong> did not match for <code>plan = {plan}</code>
            </div>
          {/snippet}
        </FeatureFlag>
      </div>
    </section>
  </div>
</div>

<style>
  .page {
    padding: 2rem 1rem;
  }

  .container {
    max-width: 760px;
    margin: 0 auto;
  }

  .text-lead {
    color: #6b7280;
    margin-bottom: 2.5rem;
  }

  .demo-section {
    margin-bottom: 3rem;
    padding-bottom: 3rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .demo-section:last-child {
    border-bottom: none;
  }

  .demo-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .demo-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: #3b82f6;
    color: white;
    font-weight: 700;
    font-size: 0.9rem;
    flex-shrink: 0;
  }

  .demo-description {
    color: #6b7280;
    margin-bottom: 1.25rem;
  }

  .setup-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #3b82f6;
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
    margin-bottom: 1.25rem;
  }

  .setup-title {
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #3b82f6;
    margin-bottom: 0.5rem;
  }

  .setup-box ol {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.9rem;
    color: #374151;
  }

  .setup-box code {
    background: #e0e7ff;
    color: #3730a3;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 0.85em;
  }

  .demo-controls {
    margin-bottom: 1rem;
  }

  .control-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: #374151;
  }

  .control-label select {
    padding: 0.3rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    font-size: 0.9rem;
  }

  .demo-output {
    margin-top: 0.5rem;
  }

  .flag-result {
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 0.95rem;
  }

  .flag-result--on {
    background: #f0fdf4;
    border: 1px solid #86efac;
    color: #166534;
  }

  .flag-result--off {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    color: #6b7280;
  }

  code {
    background: #e0e7ff;
    color: #3730a3;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 0.85em;
  }
</style>
