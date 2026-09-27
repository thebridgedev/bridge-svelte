<script lang="ts">
  import { isAuthenticated, profileStore, getBridgeAuth } from '@nebulr-group/bridge-svelte';
</script>

<nav class="nav">
  <a href="/" class="nav-brand">Bridge Demo</a>
  <a href="/" class="nav-link">Home</a>
  <a href="/tickets" class="nav-link">Tickets</a>
  <a href="/settings/team" class="nav-link">Team</a>
  <a href="/subscription" class="nav-link">Subscription</a>
  <span class="nav-spacer"></span>
  {#if $isAuthenticated}
    <span class="nav-email">{$profileStore?.email}</span>
    <button class="nav-button" onclick={() => getBridgeAuth().logout({ redirectTo: '/' })}>Logout</button>
  {:else}
    <a href="/auth/login" class="nav-link nav-link--login">Login</a>
  {/if}
</nav>

<style>
  .nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--app-border);
    background: var(--app-surface);
  }
  .nav-brand {
    font-weight: 700;
    color: var(--app-accent);
    text-decoration: none;
  }
  .nav-link {
    color: inherit;
    text-decoration: none;
  }
  .nav-spacer {
    flex: 1;
  }
  .nav-email {
    color: var(--app-muted);
    font-size: 0.875rem;
  }
  .nav-button {
    font: inherit;
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--app-border);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
  }
</style>
