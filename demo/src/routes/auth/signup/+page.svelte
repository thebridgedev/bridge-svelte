<script lang="ts">
  import SignupForm from '@bridge-svelte/lib/client/components/sdk-auth/SignupForm.svelte';

  function handleSignup() {
    console.log('[SDK Signup] Account created');
  }

  function handleError(err: Error) {
    console.error('[SDK Signup]', err);
  }
</script>

<div class="page-container">
  <SignupForm
    showLoginLink
    loginHref="/auth/login"
    onSignup={handleSignup}
    onError={handleError}
  />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
