<script lang="ts">
  import { isAuthenticated } from '@bridge-svelte/lib/core/bridge-instance';
  import { profileStore } from '@bridge-svelte/lib/shared/profile';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  const { profile } = profileStore;

  // Content from the single source of truth — bridge-svelte/learning/auth.
  const doc = getDoc('auth');
  const guard = section(doc, 'Route protection');
  const check = section(doc, 'Checking auth status');

  const codeTabs = [
    guard?.code[0] && { label: '+layout.ts', code: guard.code[0].code, lang: 'ts' },
    guard?.code[1] && { label: '+layout.svelte', code: guard.code[1].code, lang: 'svelte' },
    check?.code[0] && { label: 'Auth status', code: check.code[0].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Login', href: '/auth/login' },
    { label: 'Feature Flags', href: '/flag-demo' },
  ];
</script>

<FeaturePage
  title="Protected Page"
  breadcrumb="Authentication / Route guards"
  oneLiner="This route is gated by the SDK's route guard — you only see it when authenticated."
  introHtml={guard?.html ?? ''}
  {codeTabs}
  {related}
>
  {#snippet live()}
    {#if $isAuthenticated}
      <div class="prot-card prot-card--ok">
        <p class="prot-status">✅ You are currently authenticated</p>
        <dl class="prot-dl">
          <dt>Name</dt>
          <dd>{$profile?.fullName ?? '—'}</dd>
          <dt>Email</dt>
          <dd>{$profile?.email ?? '—'}</dd>
          <dt>Username</dt>
          <dd>{$profile?.username ?? '—'}</dd>
          {#if $profile?.tenant}
            <dt>Tenant</dt>
            <dd>{$profile.tenant.name}</dd>
            <dt>Tenant ID</dt>
            <dd><code>{$profile.tenant.id}</code></dd>
          {/if}
        </dl>
      </div>
    {:else}
      <div class="prot-card">
        <p class="prot-status">Please log in to view this content.</p>
      </div>
    {/if}
  {/snippet}
</FeaturePage>

<style>
  .prot-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    padding: 16px;
  }
  .prot-card--ok {
    border-color: var(--live);
    background: var(--live-soft);
  }
  .prot-status {
    margin: 0 0 12px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
  }
  .prot-dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
    font-size: 13px;
  }
  .prot-dl dt {
    color: var(--text-faint);
    font-weight: 600;
  }
  .prot-dl dd {
    margin: 0;
    color: var(--text-muted);
  }
  .prot-dl code {
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
  }
</style>
