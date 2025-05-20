<script lang="ts">
  import { login } from '../../stores/auth.store.js';
</script>

<button onclick={() => login()} class="login-button">
  Login with nBlocks
</button>

<style>
  .login-button {
    display: inline-block;
    padding: 0.5rem 1rem;
    background-color: #3b82f6;
    color: white;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
  }
</style> 