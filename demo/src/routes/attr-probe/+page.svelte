<!--
  Dynamic flag probe — same visual pattern as /flag-demo but parameterized.

  URL params:
    ?key=<flag-key>               — which flag to evaluate (required)
    ?attrs=<json>                 — per-call attributes (optional)
    ?attrs_b64=<base64-json>      — per-call attributes, base64-encoded (optional)

  Playwright testids (unchanged):
    [data-testid="probe-state"]      — "active" | "fallback"
    [data-testid="probe-value"]      — JSON-stringified resolved value
    [data-testid="probe-value-type"] — typeof resolved value
    [data-testid="probe-key"]        — resolved flag key
    [data-testid="probe-attrs"]      — JSON-stringified attrs
    [data-testid="probe-default"]    — JSON-stringified default
-->
<script lang="ts">
  import { page } from '$app/state';
  import FeatureFlag from '@bridge-svelte/lib/flags/FeatureFlag.svelte';

  function parseAttrs(): Record<string, unknown> {
    const raw = page.url.searchParams.get('attrs');
    const b64 = page.url.searchParams.get('attrs_b64');
    let json: string | null = null;
    if (b64) {
      try { json = atob(b64); } catch { return {}; }
    } else if (raw) {
      json = raw;
    }
    if (!json) return {};
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch { return {}; }
  }

  const flagKey = $derived((page.url.searchParams.get('key') ?? '').trim());
  const attrs = $derived(parseAttrs());
  const hasAttrs = $derived(Object.keys(attrs).length > 0);
</script>

<div class="page">
  <div class="container">
    <h1 class="heading-xl">Flag probe</h1>
    <p class="text-lead">
      Evaluates any flag by key. Used by tests and for manual inspection — pass
      <code>?key=your-flag</code> to probe any flag in your app.
    </p>

    {#if !flagKey}
      <div class="empty-state">
        No flag key provided. Add <code>?key=your-flag-name</code> to the URL.
      </div>
    {:else}
      <section class="demo-section">
        <div class="demo-header">
          <h2 class="heading-lg">
            <code>{flagKey}</code>
          </h2>
        </div>

        <!-- Live result -->
        <div class="demo-output">
          <FeatureFlag key={flagKey} defaultValue={false} context={hasAttrs ? { attributes: attrs } : undefined}>
            {#snippet children(value)}
              <div class="flag-result flag-result--on">
                ✅ <strong>{flagKey}</strong> is <strong>ON</strong>
              </div>
              <div class="sr-only">
                <span data-testid="probe-state">active</span>
                <span data-testid="probe-value">{JSON.stringify(value)}</span>
                <span data-testid="probe-value-type">{typeof value}</span>
                <span data-testid="probe-default">false</span>
                <span data-testid="probe-key">{flagKey}</span>
                <span data-testid="probe-attrs">{JSON.stringify(attrs)}</span>
              </div>
            {/snippet}
            {#snippet fallback(value)}
              <div class="flag-result flag-result--off">
                ⬜ <strong>{flagKey}</strong> is <strong>OFF</strong> / not yet enabled
              </div>
              <div class="sr-only">
                <span data-testid="probe-state">fallback</span>
                <span data-testid="probe-value">{JSON.stringify(value)}</span>
                <span data-testid="probe-value-type">{typeof value}</span>
                <span data-testid="probe-default">false</span>
                <span data-testid="probe-key">{flagKey}</span>
                <span data-testid="probe-attrs">{JSON.stringify(attrs)}</span>
              </div>
            {/snippet}
          </FeatureFlag>
        </div>

        <!-- Context details -->
        {#if hasAttrs}
          <div class="meta">
            <div class="meta-row">
              <span class="meta-label">Attributes sent</span>
              <code>{JSON.stringify(attrs)}</code>
            </div>
          </div>
        {/if}

        <div class="setup-box">
          <p class="setup-title">How to try this</p>
          <ol>
            <li>Open <strong>Feature Control</strong> in the admin UI — <code>{flagKey}</code> appears automatically once this page loads.</li>
            <li>Enable it — the result above flips to <strong>ON</strong> instantly.</li>
            {#if hasAttrs}
              <li>The flag is being evaluated with attributes: <code>{JSON.stringify(attrs)}</code></li>
            {/if}
          </ol>
        </div>
      </section>
    {/if}
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
    margin-bottom: 2rem;
  }

  .empty-state {
    padding: 2rem;
    background: #f9fafb;
    border: 1px dashed #d1d5db;
    border-radius: 0.5rem;
    color: #6b7280;
    text-align: center;
  }

  .demo-section {
    margin-top: 1rem;
  }

  .demo-header {
    margin-bottom: 1.25rem;
  }

  .demo-output {
    margin-bottom: 1.25rem;
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

  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 1.25rem;
    font-size: 0.85rem;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #374151;
  }

  .meta-label {
    color: #9ca3af;
    min-width: 7rem;
  }

  .meta-type {
    color: #9ca3af;
  }

  .setup-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #3b82f6;
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
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

  code {
    background: #e0e7ff;
    color: #3730a3;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 0.85em;
  }

  /* Visually hidden but present in DOM — Playwright can read testids without
     display:none blocking its visibility check. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
