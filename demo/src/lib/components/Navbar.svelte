<script lang="ts">
  import { getBridgeAuth, isAuthenticated } from '@bridge-svelte/lib/core/bridge-instance';
  import { stylesToggle } from '$lib/styles-toggle.svelte.js';

  function handleLogout() {
    getBridgeAuth().logout({ redirectTo: '/' });
  }
</script>

<nav class="nav-menu">
  <div class="nav-container">
    <a href="/" class="nav-brand">
      Bridge Demo
    </a>

    <button class="styles-toggle" onclick={() => stylesToggle.toggle()}>
      {stylesToggle.enabled ? '🎨 Styles: On' : '⬜ Styles: Off'}
    </button>

    {#if $isAuthenticated}
      <div class="nav-links">
        <a href="/" class="nav-link" style="margin-right: auto">
          Home
        </a>

        <a href="/team" class="nav-link">
          Team Management
        </a>

        <a href="/workspaces" class="nav-link">
          Workspaces
        </a>

        <a href="/subscription" class="nav-link">
          Subscription
        </a>

        <a href="/protected" class="nav-link">
          Protected Page
        </a>

        <button onclick={() => handleLogout()} class="nav-button">
          Logout
        </button>
      </div>
    {:else}
      <div class="nav-links">
        <a href="/auth/login" class="nav-link nav-link--login">Login</a>
        <a href="/protected" class="nav-link">
          Protected Page
        </a>
      </div>
    {/if}
  </div>
</nav>

<style>
  .nav-menu {
    background-color: #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    padding: 1rem 0;
  }

  .nav-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .nav-brand {
    font-size: 1.5rem;
    font-weight: bold;
    color: #3b82f6;
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .nav-link {
    color: #4b5563;
    text-decoration: none;
    padding: 0.5rem;
    border-radius: 0.25rem;
    transition: color 0.2s;
  }

  .nav-link:hover {
    color: #3b82f6;
  }

  .nav-link--login {
    background-color: #3b82f6;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }

  .nav-link--login:hover {
    background-color: #2563eb;
    color: white;
  }

  .nav-button {
    background-color: #ef4444;
    color: white;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }

  .nav-button:hover {
    background-color: #dc2626;
  }

  .styles-toggle {
    font-size: 0.75rem;
    padding: 0.3rem 0.65rem;
    border: 1px solid #d1d5db;
    border-radius: 9999px;
    background: #f9fafb;
    color: #374151;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }

  .styles-toggle:hover {
    background: #f3f4f6;
  }
</style>
