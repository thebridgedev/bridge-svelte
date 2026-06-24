<script lang="ts">
  import MfaSetup from '@bridge-svelte/lib/client/components/sdk-auth/MfaSetup.svelte';
  import { isAuthenticated } from '@bridge-svelte/lib/core/bridge-instance';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  // Content from the single source of truth — bridge-svelte/learning/auth (MFA).
  const doc = getDoc('auth');
  const setup = section(doc, 'MfaSetup');
  const challenge = section(doc, 'MfaChallenge');

  const codeTabs = [
    challenge?.code[0] && { label: 'Challenge', code: challenge.code[0].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Login', href: '/auth/login' },
    { label: 'SSO', href: '/sso' },
  ];

  function handleError(e: Error) {
    console.error('[MFA]', e);
  }
</script>

<FeaturePage
  title="Multi-factor auth"
  breadcrumb="Authentication / MFA"
  oneLiner="Enrol and step-up TOTP factors from the SDK — auto-surfaced inside LoginForm, or standalone."
  introHtml={setup?.html ?? ''}
  {codeTabs}
  props={setup?.props ?? null}
  {related}
>
  {#snippet live()}
    {#if $isAuthenticated}
      <span class="mfa-label">MfaSetup — enrollment flow</span>
      <MfaSetup onComplete={() => console.log('[MFA] setup complete')} onError={handleError} />
    {:else}
      <div class="mfa-note">
        Sign in to run the live MFA enrollment flow. During login, <code>MfaChallenge</code>
        and <code>MfaSetup</code> appear automatically when the auth state requires them.
      </div>
    {/if}
  {/snippet}
</FeaturePage>

<style>
  .mfa-label {
    display: block;
    font: 600 9.5px ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 10px;
  }
  .mfa-note {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-muted);
  }
  .mfa-note code {
    font-family: ui-monospace, monospace;
    font-size: 0.86em;
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 1px 5px;
    border-radius: 5px;
  }
</style>
