<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import type { ApiToken, AvailablePrivilege, CreateApiTokenInput } from '@thebridge/auth-core';

  interface Props extends HTMLAttributes<HTMLDivElement> {}

  let { class: className, style, ...rest }: Props = $props();

  // ─── State ─────────────────────────────────────────────────────────────────

  let tokens = $state<ApiToken[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  // Create form
  let showCreateForm = $state(false);
  let creating = $state(false);
  let createName = $state('');
  let createExpiry = $state('');

  // Privilege picker
  let availablePrivileges = $state<AvailablePrivilege[]>([]);
  let selectedPrivileges = $state<string[]>([]);
  let privSearch = $state('');
  let privDropdownOpen = $state(false);

  // Show-once token display
  let newToken = $state<string | null>(null);
  let showToken = $state(false);

  // Revoke confirmation
  let revokeTarget = $state<ApiToken | null>(null);
  let revokeDialogOpen = $state(false);
  let revoking = $state(false);

  // ─── Load ───────────────────────────────────────────────────────────────────

  async function loadTokens() {
    loading = true;
    error = null;
    try {
      tokens = await getBridgeAuth().apiTokens.listTokens();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load API tokens';
    } finally {
      loading = false;
    }
  }

  $effect(() => { loadTokens(); });

  // ─── Load privileges ────────────────────────────────────────────────────────

  async function loadPrivileges() {
    try {
      availablePrivileges = await getBridgeAuth().apiTokens.listAvailablePrivileges();
    } catch { /* non-fatal — picker shows empty */ }
  }

  $effect(() => { if (showCreateForm) loadPrivileges(); });

  // ─── Create ─────────────────────────────────────────────────────────────────

  async function createToken() {
    creating = true;
    error = null;
    try {
      const input: CreateApiTokenInput = {
        name: createName.trim(),
        privileges: selectedPrivileges,
        expireAt: createExpiry || undefined,
      };
      const result = await getBridgeAuth().apiTokens.createToken(input);
      newToken = result.token;
      tokens = [result.record, ...tokens];
      showCreateForm = false;
      resetCreateForm();
      success = 'Token created. Copy it now — it will not be shown again.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create token';
    } finally {
      creating = false;
    }
  }

  function resetCreateForm() {
    createName = '';
    selectedPrivileges = [];
    privSearch = '';
    privDropdownOpen = false;
    createExpiry = '';
  }

  // ─── Revoke ─────────────────────────────────────────────────────────────────

  async function confirmRevoke() {
    if (!revokeTarget) return;
    revoking = true;
    error = null;
    try {
      await getBridgeAuth().apiTokens.revokeToken(revokeTarget.id);
      tokens = tokens.filter((t) => t.id !== revokeTarget!.id);
      success = `Token "${revokeTarget.name}" revoked.`;
      revokeDialogOpen = false;
      revokeTarget = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to revoke token';
    } finally {
      revoking = false;
    }
  }

  // ─── Clipboard ──────────────────────────────────────────────────────────────

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      success = 'Copied to clipboard!';
      setTimeout(() => (success = null), 3000);
    } catch {
      error = 'Failed to copy to clipboard';
    }
  }

  // ─── Click-outside: close privilege dropdown ─────────────────────────────────

  $effect(() => {
    if (!privDropdownOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      const picker = document.querySelector('.bridge-privilege-picker');
      if (picker && !picker.contains(e.target as Node)) {
        privDropdownOpen = false;
      }
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }
</script>

<div class={className} {style} data-bridge-api-tokens data-loading={loading} data-creating={creating} {...rest}>
    <!-- Header -->
    <div class="bridge-api-header">
      <div>
        <h2 class="bridge-api-title">API Tokens</h2>
        <p class="bridge-api-subtitle">
          Long-lived JWT tokens for programmatic API access.
        </p>
      </div>
      <button
        class="bridge-btn bridge-btn-primary"
        onclick={() => { showCreateForm = !showCreateForm; if (!showCreateForm) resetCreateForm(); }}
      >
        {showCreateForm ? '✕ Cancel' : '+ Create Token'}
      </button>
    </div>

    <!-- Error / Success banners -->
    {#if error}
      <div class="bridge-api-error-banner">{error}</div>
    {/if}
    {#if success}
      <div class="bridge-api-success-banner">{success}</div>
    {/if}

    <!-- Show-once token display -->
    {#if newToken}
      <div class="bridge-api-new-token-banner">
        <p class="bridge-api-new-token-warning">
          ⚠ Store this token securely — you won't be able to see it again.
        </p>
        <div class="bridge-api-new-token-row">
          <input
            class="bridge-input bridge-api-token-input"
            type={showToken ? 'text' : 'password'}
            readonly
            value={newToken}
          />
          <button
            class="bridge-btn-outline"
            onclick={() => (showToken = !showToken)}
            title={showToken ? 'Hide token' : 'Show token'}
          >
            {showToken ? '🙈' : '👁'}
          </button>
          <button
            class="bridge-btn-outline"
            onclick={() => copyToClipboard(newToken!)}
          >
            Copy
          </button>
        </div>
        <button
          class="bridge-btn-outline"
          onclick={() => { newToken = null; showToken = false; }}
        >
          Dismiss
        </button>
      </div>
    {/if}

    <!-- Inline create form -->
    {#if showCreateForm}
      <div class="bridge-api-inline-form">
        <h3 class="bridge-api-inline-form-title">New API Token</h3>
        <form
          class="bridge-api-inline-form-fields"
          onsubmit={(e) => { e.preventDefault(); createToken(); }}
        >
          <div class="bridge-api-inline-form-row">
            <div class="bridge-api-inline-field">
              <label class="bridge-label" for="token-name">Name <span class="bridge-api-required">*</span></label>
              <input
                id="token-name"
                class="bridge-input"
                type="text"
                placeholder="e.g. CI pipeline token"
                required
                bind:value={createName}
              />
            </div>
            <div class="bridge-api-inline-field">
              <label class="bridge-label">Privileges</label>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="bridge-privilege-picker" data-open={privDropdownOpen}>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="bridge-privilege-chips" onclick={() => (privDropdownOpen = !privDropdownOpen)}>
                  {#each selectedPrivileges as priv (priv)}
                    <span class="bridge-privilege-chip">
                      {priv}
                      <button type="button" onclick={(e) => { e.stopPropagation(); selectedPrivileges = selectedPrivileges.filter((p) => p !== priv); }}>×</button>
                    </span>
                  {/each}
                  {#if !selectedPrivileges.length}
                    <span class="bridge-privilege-placeholder">Select privileges…</span>
                  {/if}
                </div>
                {#if privDropdownOpen}
                  <div class="bridge-privilege-dropdown">
                    <input
                      class="bridge-privilege-search"
                      type="text"
                      placeholder="Search…"
                      bind:value={privSearch}
                      onclick={(e) => e.stopPropagation()}
                    />
                    {#each availablePrivileges.filter((p) => !selectedPrivileges.includes(p.key) && p.key.toLowerCase().includes(privSearch.toLowerCase())) as priv (priv.key)}
                      <button type="button" class="bridge-privilege-option"
                        onclick={(e) => { e.stopPropagation(); selectedPrivileges = [...selectedPrivileges, priv.key]; privSearch = ''; }}>
                        <span class="bridge-privilege-option-key">{priv.key}</span>
                        {#if priv.description}<span class="bridge-privilege-option-desc">{priv.description}</span>{/if}
                      </button>
                    {:else}
                      <div class="bridge-privilege-empty">No privileges found</div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
            <div class="bridge-api-inline-field bridge-api-inline-field--narrow">
              <label class="bridge-label" for="token-expiry">Expiry (optional)</label>
              <input
                id="token-expiry"
                class="bridge-input"
                type="date"
                bind:value={createExpiry}
              />
            </div>
          </div>
          <div class="bridge-api-inline-form-actions">
            <button
              type="submit"
              class="bridge-btn bridge-btn-primary"
              disabled={creating || !createName.trim()}
            >
              {creating ? 'Creating…' : 'Create Token'}
            </button>
          </div>
        </form>
      </div>
    {/if}

    <!-- Token table -->
    <div class="bridge-api-table-wrapper">
      {#if loading}
        <div class="bridge-api-empty">Loading…</div>
      {:else if tokens.length === 0}
        <div class="bridge-api-empty">
          No API tokens yet. Create one to get started.
        </div>
      {:else}
        <table class="bridge-api-table">
          <thead class="bridge-api-table-head">
            <tr>
              <th class="bridge-api-th">Name</th>
              <th class="bridge-api-th">Privileges</th>
              <th class="bridge-api-th">Created</th>
              <th class="bridge-api-th">Expires</th>
              <th class="bridge-api-th"></th>
            </tr>
          </thead>
          <tbody>
            {#each tokens as token (token.id)}
              <tr class="bridge-api-row">
                <td class="bridge-api-td-name">{token.name}</td>
                <td class="bridge-api-td">
                  <div class="bridge-api-privileges">
                    {#each token.privileges as priv (priv)}
                      <span class="bridge-badge">{priv}</span>
                    {/each}
                  </div>
                </td>
                <td class="bridge-api-td-muted">{formatDate(token.createdAt)}</td>
                <td class="bridge-api-td-muted">{formatDate(token.expireAt)}</td>
                <td class="bridge-api-td-actions">
                  <button
                    class="bridge-btn-danger-sm"
                    onclick={() => { revokeTarget = token; revokeDialogOpen = true; }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
</div>

<!-- Revoke Confirmation Dialog -->
{#if revokeDialogOpen}
  <div
    class="bridge-dialog-overlay"
    role="presentation"
    onclick={() => { revokeDialogOpen = false; revokeTarget = null; }}
  ></div>
  <div class="bridge-dialog" role="dialog" aria-modal="true">
    <h3 class="bridge-dialog-title">Revoke token?</h3>
    <p class="bridge-dialog-body">
      Token <strong>{revokeTarget?.name}</strong> will be permanently revoked and can no longer be used.
    </p>
    <div class="bridge-dialog-footer">
      <button
        class="bridge-btn-outline"
        onclick={() => { revokeDialogOpen = false; revokeTarget = null; }}
      >Cancel</button>
      <button
        class="bridge-btn bridge-btn-danger"
        disabled={revoking}
        onclick={confirmRevoke}
      >
        {revoking ? 'Revoking…' : 'Revoke'}
      </button>
    </div>
  </div>
{/if}
