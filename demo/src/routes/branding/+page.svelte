<script lang="ts">
  import { bridge } from '@bridge-svelte/lib/core/bridge.js';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  // Content from the single source of truth — bridge-svelte/learning/branding.
  const doc = getDoc('branding');
  const read = section(doc, 'Reading the branding snapshot');
  const fields = section(doc, 'Snapshot fields');
  const apply = section(doc, 'Applying branding as CSS variables');
  const hood = section(doc, 'Under the hood');

  const codeTabs = [
    read?.code[0] && { label: 'Read', code: read.code[0].code, lang: 'svelte' },
    apply?.code[0] && { label: 'As CSS vars', code: apply.code[0].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Multi-tenancy', href: '/workspaces' },
    { label: 'Live updates', href: '/billing-lifecycle' },
  ];

  // Live, reactive branding snapshot — updates over the wire on branding.updated.
  const branding = bridge.app.branding;
</script>

<FeaturePage
  title="Branding"
  breadcrumb="Branding / White-label"
  oneLiner={doc?.frontmatter.oneLiner ?? ''}
  introHtml={doc?.introHtml ?? ''}
  {codeTabs}
  props={fields?.props ?? null}
  underTheHoodHtml={hood?.html ?? ''}
  {related}
>
  {#snippet live()}
    <span class="br-label">Live preview · bridge.app.branding</span>
    {#if $branding}
      <div
        class="br-preview"
        style:background={$branding.bgColor || 'var(--surface-2)'}
        style:color={$branding.textColor || 'var(--text)'}
        style:font-family={$branding.fontFamily || 'inherit'}
      >
        {#if $branding.logo}
          <img class="br-logo" src={$branding.logo} alt={$branding.name} />
        {/if}
        <span class="br-name">{$branding.name}</span>
        <button
          class="br-btn"
          style:background={$branding.primaryButtonBgColor || 'var(--primary)'}
        >
          Primary action
        </button>
      </div>
      <details class="br-raw">
        <summary>snapshot</summary>
        <pre>{JSON.stringify($branding, null, 2)}</pre>
      </details>
    {:else}
      <div class="br-empty">
        No branding snapshot yet — it arrives with the session for the active workspace. Set a
        logo / brand colour in admin and this preview updates live.
      </div>
    {/if}
  {/snippet}
</FeaturePage>

<style>
  .br-label {
    display: block;
    font: 600 9.5px ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 10px;
  }
  .br-preview {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .br-logo {
    height: 28px;
    width: auto;
  }
  .br-name {
    font-weight: 700;
    font-size: 15px;
  }
  .br-btn {
    margin-left: auto;
    border: none;
    border-radius: 7px;
    color: #fff;
    font: 600 12.5px Inter, sans-serif;
    padding: 8px 14px;
    cursor: pointer;
  }
  .br-empty {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-muted);
  }
  .br-raw {
    margin-top: 14px;
  }
  .br-raw summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
  }
  .br-raw pre {
    margin: 8px 0 0;
    padding: 12px;
    border-radius: 8px;
    background: var(--code-bg);
    color: #a9b1d6;
    font-size: 11px;
    overflow: auto;
  }
</style>
