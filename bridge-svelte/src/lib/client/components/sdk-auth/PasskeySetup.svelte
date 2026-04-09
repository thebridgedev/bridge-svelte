<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    token: string;
    onComplete?: () => void;
    onError?: (error: Error) => void;
    onBack?: () => void;
    onExpired?: () => void;
  }

  let {
    token,
    onComplete,
    onError,
    onBack,
    onExpired,
    class: className,
    style,
    ...rest
  }: Props = $props();

  type ErrorType = 'expired' | 'cancelled' | 'unsupported' | 'network' | 'general';
  type ViewState = 'loading' | 'success' | 'error';

  let viewState = $state<ViewState>('loading');
  let errorType = $state<ErrorType>('general');
  let errorMessage = $state('');
  let supported = $state(true);

  function classifyError(err: any): ErrorType {
    if (err.name === 'NotAllowedError') return 'cancelled';
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('expired') || msg.includes('invalid token') || msg.includes('not found')) return 'expired';
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) return 'network';
    return 'general';
  }

  let heading = $derived(
    viewState === 'loading' ? 'Setting up passkey'
    : viewState === 'success' ? 'Passkey created'
    : 'Passkey setup'
  );

  async function handleSetup() {
    viewState = 'loading';
    try {
      const options = await getBridgeAuth().getPasskeyRegistrationOptions(token);

      let regResponse: any;
      if (typeof window !== 'undefined' && (window as any).__simpleWebAuthn?.startRegistration) {
        regResponse = await (window as any).__simpleWebAuthn.startRegistration(options);
      } else {
        // @ts-ignore — @simplewebauthn/browser is an optional peer dependency
        const mod = await import('@simplewebauthn/browser');
        regResponse = await mod.startRegistration({ optionsJSON: options });
      }

      const result = await getBridgeAuth().verifyPasskeyRegistration(regResponse, token);
      if (result.verified) {
        viewState = 'success';
      } else {
        errorType = 'general';
        errorMessage = 'Passkey registration could not be verified.';
        viewState = 'error';
      }
    } catch (err: any) {
      errorType = classifyError(err);
      errorMessage = err.message || 'Passkey setup failed.';
      viewState = 'error';
      onError?.(err);
    }
  }

  onMount(() => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      supported = false;
      errorType = 'unsupported';
      viewState = 'error';
      return;
    }
    handleSetup();
  });
</script>

<AuthFormWrapper {heading} class={className} {style} {...rest}>
  {#if viewState === 'loading'}
    <div class="bridge-passkey-loading">
      <Spinner size={16} />
      <p class="bridge-step-desc">Follow the prompt from your browser or device to complete passkey setup.</p>
    </div>

  {:else if viewState === 'success'}
    <Alert variant="success">Your passkey has been created.</Alert>
    <button
      type="button"
      class="bridge-btn bridge-btn-primary"
      onclick={() => onComplete?.()}
    >
      Sign in now
    </button>

  {:else if errorType === 'expired'}
    <Alert variant="error">This setup link has expired or is invalid.</Alert>
    {#if onExpired}
      <button type="button" class="bridge-btn bridge-btn-primary" onclick={() => onExpired?.()}>
        Request new setup link
      </button>
    {/if}
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-ghost" onclick={() => onBack?.()}>
        Back to sign in
      </button>
    {/if}

  {:else if errorType === 'cancelled'}
    <Alert variant="error">Passkey setup was cancelled.</Alert>
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={handleSetup}>
      Try again
    </button>
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-ghost" onclick={() => onBack?.()}>
        Back to sign in
      </button>
    {/if}

  {:else if errorType === 'unsupported'}
    <Alert variant="info">Your browser does not support passkeys.</Alert>
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => onBack?.()}>
        Back to sign in
      </button>
    {/if}

  {:else}
    <Alert variant="error">{errorMessage || 'An error occurred during passkey setup.'}</Alert>
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={handleSetup}>
      Try again
    </button>
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-ghost" onclick={() => onBack?.()}>
        Back to sign in
      </button>
    {/if}
  {/if}
</AuthFormWrapper>
