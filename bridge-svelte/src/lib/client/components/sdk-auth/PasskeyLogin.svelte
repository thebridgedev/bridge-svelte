<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLButtonAttributes {
    onLogin?: () => void;
    onError?: (error: Error) => void;
    onSetupPasskey?: () => void;
    autofill?: boolean;
  }

  let {
    onLogin,
    onError,
    onSetupPasskey,
    autofill = false,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);
  let supported = $state(false);

  onMount(() => {
    supported = typeof window !== 'undefined'
      && !!window.PublicKeyCredential;
  });

  async function handlePasskeyLogin() {
    if (loading || !supported) return;
    error = null;
    loading = true;
    try {
      const options = await getBridgeAuth().getPasskeyAuthOptions();

      let authResponse: any;
      if (typeof window !== 'undefined' && (window as any).__simpleWebAuthn?.startAuthentication) {
        authResponse = await (window as any).__simpleWebAuthn.startAuthentication(options, autofill);
      } else {
        // @ts-ignore — @simplewebauthn/browser is an optional peer dependency
        const mod = await import('@simplewebauthn/browser');
        authResponse = await mod.startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
      }

      await getBridgeAuth().authenticateWithPasskey(authResponse);
      onLogin?.();
    } catch (err: any) {
      if (err.name === 'NotAllowedError' && onSetupPasskey) {
        onSetupPasskey();
        return;
      }
      if (err.name === 'NotAllowedError') {
        error = 'Passkey authentication was cancelled.';
      } else {
        error = err.message || 'Passkey authentication failed.';
      }
      onError?.(err);
    } finally {
      loading = false;
    }
  }
</script>

{#if supported}
  {#if error}
    <Alert variant="error">{error}</Alert>
    {#if onSetupPasskey}
      <p class="bridge-passkey-setup-hint">
        Don't have a passkey? <button type="button" class="bridge-link" onclick={onSetupPasskey}>Create one.</button>
      </p>
    {/if}
  {/if}
  <button
    type="button"
    class={className}
    {style}
    data-bridge-passkey-login
    data-loading={loading}
    onclick={handlePasskeyLogin}
    disabled={loading}
    {...rest}
  >
  <span class="bridge-sso-btn-inner">
    {#if loading}
      <Spinner size={16} />
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="currentColor" stroke-width="0.5" d="M3 20v-2.35c0-.63335.158335-1.175.475-1.625.316665-.45.725-.79165 1.225-1.025 1.11665-.5 2.1875-.875 3.2125-1.125S9.96665 13.5 11 13.5c.43335 0 .85415.02085 1.2625.0625s.82915.10415 1.2625.1875c-.08335.96665.09585 1.87915.5375 2.7375C14.50415 17.34585 15.15 18.01665 16 18.5v1.5H3Zm16 3.675-1.5-1.5v-4.65c-.73335-.21665-1.33335-.62915-1.8-1.2375-.46665-.60835-.7-1.3125-.7-2.1125 0-.96665.34165-1.79165 1.025-2.475.68335-.68335 1.50835-1.025 2.475-1.025s1.79165.34165 2.475 1.025c.68335.68335 1.025 1.50835 1.025 2.475 0 .75-.2125 1.41665-.6375 2-.425.58335-.9625 1-1.6125 1.25l1.25 1.25-1.5 1.5 1.5 1.5-2 2ZM11 11.5c-1.05 0-1.9375-.3625-2.6625-1.0875-.725-.725-1.0875-1.6125-1.0875-2.6625s.3625-1.9375 1.0875-2.6625C9.0625 4.3625 9.95 4 11 4s1.9375.3625 2.6625 1.0875c.725.725 1.0875 1.6125 1.0875 2.6625s-.3625 1.9375-1.0875 2.6625C12.9375 11.1375 12.05 11.5 11 11.5Zm7.5 3.175c.28335 0 .52085-.09585.7125-.2875S19.5 13.95835 19.5 13.675c0-.28335-.09585-.52085-.2875-.7125s-.42915-.2875-.7125-.2875c-.28335 0-.52085.09585-.7125.2875S17.5 13.39165 17.5 13.675c0 .28335.09585.52085.2875.7125s.42915.2875.7125.2875Z"/>
      </svg>
    {/if}
    <span>Sign in with Passkeys</span>
  </span>
  </button>
{/if}
