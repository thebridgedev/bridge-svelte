<script lang="ts">
  import ConfigStatus from '$lib/components/ConfigStatus.svelte';

  type Card = { href: string; title: string; blurb: string; tag: string };

  // Overview grid — every card deep-links to a real feature route. The same
  // routes back the Playwright suite and are browsable as reference code.
  const CARDS: Card[] = [
    { href: '/auth/login', title: 'SDK Authentication', blurb: 'Email/password, magic link, passkeys & OAuth — fully embedded, no redirect.', tag: 'Auth' },
    { href: '/sso', title: 'Single sign-on', blurb: 'Federate against your customers’ IdPs (SAML / OIDC) with one config.', tag: 'Auth' },
    { href: '/mfa', title: 'Multi-factor auth', blurb: 'Enrol and step-up TOTP factors from the SDK.', tag: 'Auth' },
    { href: '/protected', title: 'Route guards', blurb: 'Declarative per-route protection — roles, plans & feature flags.', tag: 'Auth' },
    { href: '/flag-demo', title: 'Feature flags', blurb: 'Ship behind a flag; flip who sees what live from admin, no redeploy.', tag: 'Flags' },
    { href: '/rollout', title: 'Percentage rollout', blurb: 'Sticky-bucketed gradual releases & A/B cohorts.', tag: 'Flags' },
    { href: '/team-panel', title: 'Team management', blurb: 'Invite, role, and remove members with the drop-in panel.', tag: 'Tenancy' },
    { href: '/workspaces', title: 'Workspaces & tenancy', blurb: 'Multi-tenant workspace selection, switching & isolation.', tag: 'Tenancy' },
    { href: '/api-tokens', title: 'API tokens', blurb: 'Scoped programmatic access — issue, show-once, revoke.', tag: 'Tenancy' },
    { href: '/subscription', title: 'Subscriptions', blurb: 'Plan selection, Stripe checkout & billing-portal handover.', tag: 'Billing' },
    { href: '/paywall', title: 'Paywall & entitlements', blurb: 'Gate features behind plan-granted entitlements & quotas.', tag: 'Billing' },
    { href: '/branding', title: 'Live branding', blurb: 'White-label colours & logo that update over the wire.', tag: 'Branding' },
  ];
</script>

<div class="home">
  <header class="hero">
    <h1 class="hero-title">Welcome to Bridge Svelte Demo</h1>
    <p class="hero-lead">
      A runnable, docs-accurate reference for integrating Bridge in a SvelteKit app.
      Every page below pairs a <strong>live SDK component</strong> with the exact code from
      our docs — open the inspector (⚡, top right) to watch the SDK work in real time.
    </p>
  </header>

  <ConfigStatus />

  <section class="grid">
    {#each CARDS as c (c.href)}
      <a class="card" href={c.href}>
        <span class="card-tag">{c.tag}</span>
        <span class="card-title">{c.title}</span>
        <span class="card-blurb">{c.blurb}</span>
        <span class="card-go">Open →</span>
      </a>
    {/each}
  </section>
</div>

<style>
  .home {
    max-width: 1040px;
    margin: 0 auto;
    padding: 40px 24px 80px;
  }
  .hero {
    margin-bottom: 28px;
  }
  .hero-title {
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0;
    color: var(--text);
  }
  .hero-lead {
    margin: 14px 0 0;
    max-width: 70ch;
    font-size: 15px;
    line-height: 1.65;
    color: var(--text-muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
    margin-top: 28px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--surface);
    text-decoration: none;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  .card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }
  .card-tag {
    align-self: flex-start;
    font: 600 9.5px ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--primary);
    background: var(--primary-soft);
    padding: 3px 8px;
    border-radius: 6px;
  }
  .card-title {
    font-size: 15px;
    font-weight: 650;
    color: var(--text);
  }
  .card-blurb {
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-muted);
    flex: 1;
  }
  .card-go {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--primary);
  }

  @media (max-width: 600px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
