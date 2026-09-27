<!--
  TBP-696 — the same pages under /auth/framed/*, restyled with the two
  snippets: `frame` replaces everything around the form, `heading` replaces the
  form heading on each page's main step. No route is owned.

  Demo-only: the e2e suite uses it to prove the snippets apply on every page and
  that the heading disappears on LoginForm's sub-steps instead of stacking above
  their own (TBP-537).
-->
<script lang="ts">
  import { BridgeAuthRoutes, type BridgeAuthPage } from '@bridge-svelte/lib/index';

  const titles: Record<BridgeAuthPage, string> = {
    login: 'Welcome back to the demo',
    signup: 'Join the demo',
    'oauth-callback': '',
    'set-password': 'Choose your demo password',
    'forgot-password': 'Lost your demo password?',
    'magic-link': 'Get a demo sign-in link',
    'setup-passkey': 'Adding your demo passkey',
    workspaces: 'Pick a demo workspace',
  };
</script>

<BridgeAuthRoutes>
  {#snippet frame(page, children)}
    <section class="demo-auth-frame" data-demo-frame={page}>
      <p class="demo-auth-brand">Bridge demo</p>
      {@render children()}
    </section>
  {/snippet}
  {#snippet heading(page)}
    <h1 class="demo-auth-title" data-demo-heading={page}>{titles[page]}</h1>
  {/snippet}
</BridgeAuthRoutes>

<style>
  .demo-auth-frame {
    max-width: 420px;
    margin: 3rem auto;
    padding: 2rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-2);
  }
  .demo-auth-brand {
    margin: 0 0 1rem;
    font: 600 11px ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .demo-auth-title {
    margin: 0 0 1rem;
    font-size: 1.4rem;
  }
</style>
