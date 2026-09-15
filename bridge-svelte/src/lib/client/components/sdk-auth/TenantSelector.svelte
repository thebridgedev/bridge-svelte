<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { MessageOverrides, TenantUser } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth, tenantUsersStore } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import { authErrorMessage } from './shared/auth-error.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onSelect?: () => void;
    onError?: (error: Error) => void;
    tenantItem?: Snippet<[TenantUser]>;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let {
    onSelect,
    onError,
    tenantItem,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(getTranslator(messages));

  let loading = $state(false);
  let selectedId = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function handleSelect(tenantUser: TenantUser) {
    if (loading) return;
    error = null;
    selectedId = tenantUser.id;
    loading = true;
    try {
      await getBridgeAuth().selectTenant(tenantUser.id);
      onSelect?.();
    } catch (err: any) {
      error = authErrorMessage(err, t, 'tenant.error.select');
      onError?.(err);
    } finally {
      loading = false;
      selectedId = null;
    }
  }
</script>

<AuthFormWrapper heading={t('tenant.chooseHeading')} class={className} {style} {...rest}>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  <div class="bridge-tenant-list">
    {#each $tenantUsersStore as tu (tu.id)}
      <button
        type="button"
        class="bridge-tenant-item"
        data-tenant-id={tu.id}
        data-loading={selectedId === tu.id}
        onclick={() => handleSelect(tu)}
        disabled={loading}
      >
        {#if tenantItem}
          {@render tenantItem(tu)}
        {:else}
          <span class="bridge-tenant-avatar">
            {#if tu.tenant.logo}
              <img src={tu.tenant.logo} alt={tu.tenant.name} />
            {:else}
              {tu.tenant.name.charAt(0).toUpperCase()}
            {/if}
          </span>
          <span class="bridge-tenant-info">
            <span class="bridge-tenant-name">{tu.tenant.name}</span>
            <span class="bridge-tenant-user">{tu.fullName}</span>
          </span>
          {#if selectedId === tu.id}
            <Spinner size={18} />
          {/if}
        {/if}
      </button>
    {/each}
  </div>
</AuthFormWrapper>
