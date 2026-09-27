<!--
  TEST FIXTURE — customisation level 4, headless. The app's own form, its own
  markup, no Bridge component: `getBridgeAuth().authenticate()` signs in, and
  everything around the form (tokens, route guards, the return-to deep link,
  the signed-in nav) keeps working because it lives in bridgeBootstrap and
  <BridgeBootstrap>, not in the pages.
  e2e/playwright/tests/customisation/rung-4-headless.spec.ts proves it.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { getBridgeAuth, isAuthenticated, readReturnTo } from '@nebulr-group/bridge-svelte';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function signIn(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const result = await getBridgeAuth().authenticate(email, password);
      // One workspace and no MFA: authenticate() finished the sign-in itself.
      // A real form would branch to its own MFA / workspace step here.
      if (!getBridgeAuth().isAuthenticated()) {
        error = `Next step needed: ${result.mfaState}, ${result.tenantUsers.length} workspaces`;
        return;
      }
      await goto(readReturnTo(page.url) ?? '/tickets');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<form class="own-form" data-testid="headless-form" onsubmit={signIn}>
  <h1>Sign in to the helpdesk</h1>
  <input type="email" name="email" placeholder="Work email" autocomplete="username" bind:value={email} />
  <input type="password" name="password" placeholder="Password" autocomplete="current-password" bind:value={password} />
  <button type="submit" disabled={busy}>Continue</button>
  {#if error}<p role="alert" data-testid="headless-error">{error}</p>{/if}
  <p data-testid="headless-state">{$isAuthenticated ? 'signed-in' : 'signed-out'}</p>
</form>

<style>
  .own-form {
    display: grid;
    gap: 0.75rem;
    max-width: 22rem;
    margin: 3rem auto;
  }
</style>
