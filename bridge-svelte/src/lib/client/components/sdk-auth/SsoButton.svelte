<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { FederationConnection } from '@thebridge/auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Spinner from './shared/Spinner.svelte';

  interface Props extends HTMLButtonAttributes {
    connection: FederationConnection;
    label?: string;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
    icon?: Snippet;
  }

  let {
    connection,
    label,
    onSuccess,
    onError,
    icon,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let loading = $state(false);
  let buttonLabel = $derived(label ?? `Continue with ${connection.name}`);

  async function handleClick() {
    if (loading) return;
    loading = true;
    try {
      const result = await getBridgeAuth().startSsoLogin(connection.type);
      if (result.type === 'auth_success') {
        onSuccess?.();
      } else if (result.type === 'auth_error') {
        throw new Error(result.error || 'SSO login failed');
      }
      // auth_mfa_required and auth_tenant_selection are handled by authState store
    } catch (err: any) {
      const message = err.message?.includes('popup')
        ? 'Pop-up was blocked. Please allow pop-ups and try again.'
        : err.message || 'SSO login failed';
      onError?.(new Error(message));
    } finally {
      loading = false;
    }
  }
</script>

<button
  type="button"
  class={className}
  {style}
  data-bridge-sso-button
  data-loading={loading}
  onclick={handleClick}
  disabled={loading}
  {...rest}
>
  <span class="bridge-sso-btn-inner">
    {#if loading}
      <Spinner size={16} />
    {:else if icon}
      {@render icon()}
    {/if}
    <span>{buttonLabel}</span>
  </span>
</button>
