<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { FederationConnection, MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import { authErrorMessage } from './shared/auth-error.js';
  import Spinner from './shared/Spinner.svelte';

  interface Props extends HTMLButtonAttributes {
    connection: FederationConnection;
    label?: string;
    /**
     * SSO kickoff strategy.
     * - 'redirect' (default): full-page navigation to the federation endpoint,
     *   provider returns via the normal OAuth callback chain.
     * - 'popup': opens window.open and resolves via postMessage — useful for
     *   embedded widgets that must not unload the host page.
     */
    mode?: 'redirect' | 'popup';
    onSuccess?: () => void;
    onError?: (error: Error) => void;
    icon?: Snippet;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let {
    connection,
    label,
    mode = 'redirect',
    onSuccess,
    onError,
    icon,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(getTranslator(messages));

  let loading = $state(false);
  // `label` still wins: an app naming its own provider button is voice, not
  // mechanics, and the catalogue only supplies the default (TBP-634).
  let buttonLabel = $derived(label ?? t('sso.continueWith', { provider: connection.name }));

  async function handleClick() {
    if (loading) return;
    loading = true;
    try {
      const result = await getBridgeAuth().startSsoLogin(connection.type, { mode });
      if (result.type === 'auth_success') {
        onSuccess?.();
      } else if (result.type === 'auth_error') {
        throw new Error(result.error || t('sso.error.login'));
      }
      // auth_mfa_required and auth_tenant_selection are handled by authState store
    } catch (err: any) {
      const message = err.message?.includes('popup')
        ? t('sso.error.popupBlocked')
        : authErrorMessage(err, t, 'sso.error.login');
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
