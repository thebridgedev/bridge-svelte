<!--
  "Continue with Google" and the other social providers the app offers (its
  sign-in options' `social`). A click sends the browser to the provider; its
  answer comes back to the sign-in page (`returnPage`), where SignInForm
  finishes it in this browser. On the sign-up form, `intent="sign-up"` makes
  an account for an address that has none, with the form's plan and
  attribution.
-->
<script lang="ts">
  import { isBridgeError, type SocialProvider, type SocialStartInput } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';

  interface Props {
    /** The providers to show, in this order: the app's sign-in options' `social`. */
    providers: readonly SocialProvider[];
    intent?: 'sign-in' | 'sign-up';
    /** The page the provider's answer comes back to. @default this page */
    returnPage?: string;
    /** For a sign-up: what the sign-up form would send, read at the click. */
    signUp?: () => Omit<SocialStartInput, 'intent' | 'returnPage'>;
    disabled?: boolean;
    onError?: (message: string, error: unknown) => void;
    /** Each button's words, for the provider's name. @default "Continue with {provider}" */
    label?: (name: string) => string;
    messages?: BridgeMessages;
  }

  let { providers, intent = 'sign-in', returnPage = undefined, signUp = undefined, disabled = false, onError, label = undefined, messages }: Props = $props();
  const t = $derived(translator(messages));
  /** The providers' names, as their own sign-in buttons say them. */
  const NAMES: Record<SocialProvider, string> = { google: 'Google', linkedin: 'LinkedIn', facebook: 'Facebook', github: 'GitHub', azure: 'Microsoft' };
  let going = $state<SocialProvider | null>(null);

  /**
   * The page the provider's answer comes back to. On another app's sign-in request (Bridge's hosted page) the page took
   * the request out of its address when it opened: it goes back in, so the page coming back signs in for it again.
   */
  async function pageToReturnTo(): Promise<string> {
    const back = new URL(returnPage ?? window.location.href);
    back.hash = '';
    const request = await getBridge().request.current();
    if (request !== null && !back.searchParams.has('request')) back.searchParams.set('request', request);
    return back.toString();
  }

  async function go(provider: SocialProvider) {
    if (going !== null || disabled) return;
    going = provider;
    try {
      const url = await getBridge().social.start(provider, { intent, returnPage: await pageToReturnTo(), ...(intent === 'sign-up' ? (signUp?.() ?? {}) : {}) });
      window.location.assign(url);
    } catch (error) {
      going = null;
      onError?.(isBridgeError(error) ? errorMessage(error, t, 'error.generic') : t('error.generic'), error);
    }
  }
</script>

{#if providers.length > 0}
  <div class="bridge-social" data-bridge-social>
    {#each providers as provider (provider)}
      <button type="button" class="bridge-btn bridge-btn-secondary bridge-social-btn" data-bridge-social-provider={provider} onclick={() => go(provider)} disabled={disabled || going !== null}>
        {label ? label(NAMES[provider]) : t('social.continueWith', { provider: NAMES[provider] })}
      </button>
    {/each}
  </div>
{/if}
