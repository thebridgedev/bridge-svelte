<script lang="ts">
    import { getConfig } from '@bridge-svelte/lib/client/stores/config.store';
    import { isAuthenticated } from '@bridge-svelte/lib/core/bridge-instance';
    import { onMount } from 'svelte';
    import TokenStatus from './TokenStatus.svelte';
    let config = $state<{ appId: string } | null>(null);
    let error = $state<Error | null>(null);
    let editing = $state(false);
    let newAppId = $state('');

    const envAppId = import.meta.env.VITE_BRIDGE_APP_ID as string | undefined;
    const localAppId = localStorage.getItem('bridge:appId');
    // localStorage takes priority; env var is the fallback
    const source = localAppId ? (envAppId ? 'localStorage (overriding env var)' : 'localStorage') : envAppId ? 'env var' : 'config';
    const canReset = !!localAppId && !!envAppId; // localStorage is active but env var exists to fall back to

    function reset() {
      localStorage.clear();
      location.reload();
    }

    onMount(() => {
      try {
        config = getConfig();
        newAppId = config?.appId ?? '';
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
      }
    });

    function startEdit() { editing = true; }
    function cancelEdit() { editing = false; newAppId = config?.appId ?? ''; }

    function save() {
      const trimmed = newAppId.trim();
      if (!trimmed) return;
      localStorage.clear();
      localStorage.setItem('bridge:appId', trimmed);
      location.reload();
    }
  </script>

  {#if error}
    <div class="feature-status">
      <p class="font-bold">❌ Config Error</p>
      <p>{error.message}</p>
      {#if error.message.includes('appId is required')}
        <p class="mt-2 text-sm">
          Please set <code>VITE_BRIDGE_APP_ID</code> env var or provide an <code>appId</code> in your config.
        </p>
      {:else}
        <p class="mt-2 text-sm">Make sure Bridge config is initialized before using its features.</p>
      {/if}
    </div>
  {:else if config}
    <div class="feature-status active">
      <p class="font-bold">✅ Success</p>
      <p style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
        Bridge configuration initialized with appId:

        {#if editing}
          <form
            onsubmit={(e) => { e.preventDefault(); save(); }}
            style="display:flex;gap:0.4rem;align-items:center;"
          >
            <input
              type="text"
              bind:value={newAppId}
              style="font-size:0.8rem;padding:0.2rem 0.4rem;border:1px solid #6b7280;border-radius:0.25rem;font-family:monospace;width:16rem;"
              autofocus
            />
            <button type="submit" style="font-size:0.75rem;padding:0.2rem 0.6rem;background:#2563eb;color:white;border:none;border-radius:0.25rem;cursor:pointer;">
              Save & reload
            </button>
            <button type="button" onclick={cancelEdit} style="font-size:0.75rem;padding:0.2rem 0.5rem;background:none;border:1px solid #6b7280;border-radius:0.25rem;cursor:pointer;">
              Cancel
            </button>
          </form>
        {:else}
          <code
            onclick={startEdit}
            title="Click to change"
            style="cursor:pointer;border-bottom:1px dashed #6b7280;"
          >{config.appId}</code>
        {/if}

        <span style="font-size:0.72rem;color:#6b7280;">({source})</span>
        {#if canReset && !editing}
          <button type="button" onclick={reset} style="font-size:0.72rem;background:none;border:none;color:#b45309;cursor:pointer;text-decoration:underline;padding:0;">
            reset to env var
          </button>
        {/if}
      </p>
    </div>
  {/if}

  {#if $isAuthenticated}
    <TokenStatus />
  {/if}
  