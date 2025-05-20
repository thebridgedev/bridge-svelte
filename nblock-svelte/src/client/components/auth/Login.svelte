<script lang="ts">
  import { authState, login } from '../../stores/auth.store.js';
  
  export let redirectUri: string | undefined = undefined;
  
  function handleLogin() {
    login({ redirectUri });
  }
</script>

<button
  onclick={handleLogin}
  disabled={$authState.isLoading}
  class="nblocks-login-button"
>
  {#if $authState.isLoading}
    Loading...
  {:else}
    Login with nBlocks
  {/if}
</button>

{#if $authState.error}
  <div class="nblocks-error">
    {$authState.error}
  </div>
{/if}

<style>
  .nblocks-login-button {
    display: inline-block;
    padding: 0.5rem 1rem;
    background-color: #3b82f6;
    color: white;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .nblocks-login-button:hover {
    background-color: #2563eb;
  }

  .nblocks-login-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  .nblocks-error {
    color: #ef4444;
    margin-top: 0.5rem;
    font-size: 0.875rem;
  }
</style> 