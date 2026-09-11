<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import LoginForm from '@bridge-svelte/lib/client/components/sdk-auth/LoginForm.svelte';
  // TBP-629 — the SDK-mode route guard parks the attempted deep link on this
  // route as `?redirectUri=…`. `readReturnTo` is the reader half, re-exported by
  // bridge-svelte so a consumer gets the open-redirect validation for free
  // instead of hand-rolling it (and getting it wrong).
  import { readReturnTo } from '@bridge-svelte/lib/index';

  /** Where a login with nothing to return to lands — the demo's default route. */
  const DEFAULT_REDIRECT_ROUTE = '/protected';

  function handleLogin() {
    // Null when the param is absent, off-origin, protocol-relative, or otherwise
    // unsafe — in every one of those cases we fall back to the default route.
    goto(readReturnTo($page.url) ?? DEFAULT_REDIRECT_ROUTE);
  }

  function handleError(err: Error) {
    console.error('[SDK Login]', err);
  }
</script>

<div class="page-container">
  <LoginForm
    class="my-login-form"
    showSignupLink
    signupHref="/auth/signup"
    showForgotPassword
    showMagicLink
    showPasskeys
    onLogin={handleLogin}
    onError={handleError}
  />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }

  /* Demonstrates consumer-controlled layout via class prop */
  .page-container :global(.my-login-form) {
    max-width: 380px;
    margin: 0 auto;
  }
</style>
