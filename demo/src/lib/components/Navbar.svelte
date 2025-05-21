<script lang="ts">
  import { goto } from '$app/navigation';
  import Login from '@nblocks-svelte/client/components/auth/Login.svelte';
  import { authState, logout } from '@nblocks-svelte/client/stores/auth.store';

  async function handleLogout() {
    logout();
    goto('/');
  }
</script>

<nav class="nav-menu">
  <div class="nav-container">
    <a href="/" class="nav-brand">
      nBlocks Demo
    </a>
    
    {#if $authState.isAuthenticated}
      <div class="nav-links">
        <a href="/" class="nav-link" style="margin-right: auto">
          Home
        </a>
        
        <a href="/team" class="nav-link">
          Team Management
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
        <div class="nav-login">
          <Login />
        </div>
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
</style> 