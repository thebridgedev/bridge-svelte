<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { onMount } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import { authErrorMessage } from './shared/auth-error.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    token: string;
    onComplete?: () => void;
    onError?: (error: Error) => void;
    onBack?: () => void;
    onExpired?: () => void;
    /**
     * Loading-step description. Pass `null`/`''` to render nothing (TBP-631).
     *
     * NOT lifted into AuthFormWrapper, unlike the other components: this
     * paragraph sits inside `.bridge-passkey-loading` next to the Spinner and
     * is laid out as part of that indicator. Hoisting it above the wrapper's
     * children would silently change the visual arrangement, which is a worse
     * outcome than one component guarding its own element.
     */
    description?: string | null;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let {
    token,
    onComplete,
    onError,
    onBack,
    onExpired,
    description = undefined,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(getTranslator(messages));

  // `undefined` = not passed, use the catalogue; `null` = host suppression that
  // must survive (TBP-631).
  const stepDescription = $derived(
    description !== undefined ? description : t('passkey.setupDescription'),
  );

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
    viewState === 'loading' ? t('passkey.settingUpHeading')
    : viewState === 'success' ? t('passkey.setupSuccessHeading')
    : t('passkey.setupHeading')
  );

  async function handleSetup() {
    viewState = 'loading';
    try {
      const options = await getBridgeAuth().getPasskeyRegistrationOptions(token);

      let regResponse: any;
      if (typeof window !== 'undefined' && (window as any).__simpleWebAuthn?.startRegistration) {
        regResponse = await (window as any).__simpleWebAuthn.startRegistration({ optionsJSON: options });
      } else {
        // @ts-ignore — @simplewebauthn/browser is an optional peer dependency
        const mod = await import('@simplewebauthn/browser');
        regResponse = await mod.startRegistration({ optionsJSON: options as any });
      }

      const result = await getBridgeAuth().verifyPasskeyRegistration(regResponse, token);
      if (result.verified) {
        viewState = 'success';
      } else {
        errorType = 'general';
        errorMessage = t('passkey.error.verify');
        viewState = 'error';
      }
    } catch (err: any) {
      errorType = classifyError(err);
      errorMessage = authErrorMessage(err, t, 'passkey.error.setupFailed');
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
      {#if stepDescription}
        <p class="bridge-step-desc">{stepDescription}</p>
      {/if}
    </div>

  {:else if viewState === 'success'}
    <Alert variant="success">{t('passkey.setupSuccessDescription')}</Alert>
    <button
      type="button"
      class="bridge-btn bridge-btn-primary"
      onclick={() => onComplete?.()}
    >
      {t('passkey.signInNow')}
    </button>

  {:else if errorType === 'expired'}
    <Alert variant="error">{t('passkey.error.expired')}</Alert>
    {#if onExpired}
      <button type="button" class="bridge-btn bridge-btn-primary" onclick={() => onExpired?.()}>
        {t('passkey.requestNewLink')}
      </button>
    {/if}
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-ghost" onclick={() => onBack?.()}>
        {t('action.backToSignIn')}
      </button>
    {/if}

  {:else if errorType === 'cancelled'}
    <Alert variant="error">{t('passkey.error.cancelled')}</Alert>
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={handleSetup}>
      {t('action.tryAgain')}
    </button>
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-ghost" onclick={() => onBack?.()}>
        {t('action.backToSignIn')}
      </button>
    {/if}

  {:else if errorType === 'unsupported'}
    <Alert variant="info">{t('passkey.error.unsupported')}</Alert>
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => onBack?.()}>
        {t('action.backToSignIn')}
      </button>
    {/if}

  {:else}
    <Alert variant="error">{errorMessage || t('passkey.error.setup')}</Alert>
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={handleSetup}>
      {t('action.tryAgain')}
    </button>
    {#if onBack}
      <button type="button" class="bridge-btn bridge-btn-ghost" onclick={() => onBack?.()}>
        {t('action.backToSignIn')}
      </button>
    {/if}
  {/if}
</AuthFormWrapper>
