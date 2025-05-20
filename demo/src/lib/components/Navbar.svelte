<script lang="ts">
  import Login from '@nblocks-svelte/client/components/auth/Login.svelte';
</script>

<nav class="nav-menu">
  <div class="nav-container">
    <a href="/" class="nav-brand">
      nBlocks Demo
    </a>
    <div class="nav-login">
      <Login></Login>
    </div>
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
</style> 