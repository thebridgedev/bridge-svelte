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
  const NAMES: Record<SocialProvider, string> = { google: 'Google', linkedin: 'LinkedIn', facebook: 'Facebook', github: 'GitHub', azure: 'Microsoft', apple: 'Apple' };
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
      {#if provider === 'apple'}
        <!-- Sign in with Apple, as Apple's Human Interface Guidelines draw it: black, the Apple logo, "Continue with Apple". -->
        <button type="button" class="bridge-btn bridge-social-btn bridge-social-apple" data-bridge-social-provider="apple" onclick={() => go(provider)} disabled={disabled || going !== null}>
          <svg class="bridge-social-apple-logo" viewBox="0 0 17 20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14.06 10.62c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.31-.89-2.33-3.54zM11.88 4.16c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.23z"/></svg>
          <!-- Apple's button says only what Apple allows: "Continue with Apple", whatever the form's own label. -->
          <span>{t('social.continueWith', { provider: NAMES[provider] })}</span>
        </button>
      {:else}
        <button type="button" class="bridge-btn bridge-btn-secondary bridge-social-btn" data-bridge-social-provider={provider} onclick={() => go(provider)} disabled={disabled || going !== null}>
          {label ? label(NAMES[provider]) : t('social.continueWith', { provider: NAMES[provider] })}
        </button>
      {/if}
    {/each}
  </div>
{/if}
