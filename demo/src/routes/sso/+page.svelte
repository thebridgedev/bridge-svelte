<script lang="ts">
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  // Content from the single source of truth — bridge-svelte/learning/auth (SsoButton).
  const doc = getDoc('auth');
  const sso = section(doc, 'SsoButton');

  const codeTabs = [
    sso?.code[0] && { label: 'Usage', code: sso.code[0].code, lang: 'svelte' },
    sso?.code[1] && { label: 'Redirect mode', code: sso.code[1].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Login', href: '/auth/login' },
    { label: 'MFA', href: '/mfa' },
  ];
</script>

<FeaturePage
  title="Single sign-on"
  breadcrumb="Authentication / SSO"
  oneLiner="Federate against your customers’ IdPs (SAML / OIDC) — buttons render from your configured connections."
  introHtml={sso?.html ?? ''}
  {codeTabs}
  props={sso?.props ?? null}
  {related}
>
  {#snippet live()}
    <div class="sso-note">
      <p>
        SSO buttons render automatically inside <code>&lt;LoginForm /&gt;</code> for every
        federation connection configured in the Bridge admin — and standalone via
        <code>&lt;SsoButton /&gt;</code> for custom login pages.
      </p>
      <p>
        Configure a connection (Google, Microsoft, Okta…) in admin, then open the live login
        page to see the buttons and complete a real redirect/popup flow.
      </p>
      <a class="sso-cta" href="/auth/login">Open the live login page →</a>
    </div>
  {/snippet}
</FeaturePage>

<style>
  .sso-note {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-muted);
  }
  .sso-note code {
    font-family: ui-monospace, monospace;
    font-size: 0.86em;
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 1px 5px;
    border-radius: 5px;
  }
  .sso-cta {
    align-self: flex-start;
    font-size: 13px;
    font-weight: 600;
    color: var(--primary);
    text-decoration: none;
  }
</style>
