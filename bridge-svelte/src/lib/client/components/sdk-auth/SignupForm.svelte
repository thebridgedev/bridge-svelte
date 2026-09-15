<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import { authErrorMessage } from './shared/auth-error.js';
  import { getConfig } from '../../stores/config.store.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onSignup?: () => void;
    onError?: (error: Error) => void;
    showLoginLink?: boolean;
    /** Override login page URL. Default: derived from BridgeConfig loginRoute. */
    loginHref?: string | undefined;
    /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
    heading?: string | null;
    /**
     * Success-state description. Pass `null`/`''` to render nothing (TBP-631).
     *
     * NOT lifted into AuthFormWrapper: it follows the "Check your email"
     * success heading, which is rendered inside the wrapper's children rather
     * than as the wrapper heading. Hoisting it would print the description
     * above the heading it belongs under.
     *
     * A string override loses the `<strong>{email}</strong>` emphasis, since a
     * plain prop cannot carry markup — that is the trade for a simple API, and
     * the default keeps the emphasis.
     */
    description?: string | null;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
    /** TBP-36 — preselected plan applied at tenant creation (from ?signupPlan= links). */
    plan?: string | null;
    /** TBP-36 — currency of the preselected plan's price offer. */
    currency?: string | null;
    /** TBP-36 — recurrence interval of the preselected plan's price offer. */
    recurrenceInterval?: string | null;
    footer?: Snippet;
  }

  let {
    onSignup,
    onError,
    showLoginLink = true,
    loginHref = undefined,
    heading = undefined,
    description = undefined,
    messages,
    plan = null,
    currency = null,
    recurrenceInterval = null,
    footer,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(getTranslator(messages));

  // `undefined` = not passed, fall through to the catalogue; `null` = the host
  // suppressed it and that must survive (TBP-631).
  const wrapperHeading = $derived(heading !== undefined ? heading : t('signup.heading'));

  // The success sentence needs `<strong>{email}</strong>` in the middle of it.
  // The catalogue holds the WHOLE sentence with a `{email}` placeholder, so a
  // locale is free to move the address anywhere; the split happens on the
  // already-translated string, not on the English word order.
  const successDescriptionParts = $derived(t('signup.successDescription').split('{email}'));

  let effectiveLoginHref = $derived(loginHref ?? getConfig().loginRoute);

  let email = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  async function handleSubmit() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().signup(email, firstName, lastName, plan ? {
        plan,
        currency: currency ?? undefined,
        recurrenceInterval: recurrenceInterval ?? undefined,
      } : undefined);
      success = true;
      onSignup?.();
    } catch (err: any) {
      error = authErrorMessage(err, t, 'signup.error.create');
      onError?.(err);
    } finally {
      loading = false;
    }
  }
</script>

<!-- In the success state, the "Check your email" heading below is the title,
     so suppress the form heading to avoid two stacked headings. -->
<AuthFormWrapper heading={success ? null : wrapperHeading} class={className} {style} {...rest}>
  {#if success}
    <h2 class="bridge-success-heading">{t('signup.successHeading')}</h2>
    {#if description === undefined}
      <p class="bridge-step-desc">{successDescriptionParts[0]}<strong>{email}</strong>{successDescriptionParts[1] ?? ''}</p>
    {:else if description}
      <p class="bridge-step-desc">{description}</p>
    {/if}
    {#if footer}
      {@render footer()}
    {:else if showLoginLink}
      <div class="bridge-form-footer">
        {t('signup.loginPrompt')} <a href={effectiveLoginHref}>{t('signup.loginLink')}</a>
      </div>
    {/if}
  {:else}
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="bridge-form-group">
        <label for="signup-email">{t('field.email')}</label>
        <input
          id="signup-email"
          type="email"
          placeholder={t('placeholder.email')}
          required
          bind:value={email}
          disabled={loading}
        />
      </div>
      <div class="bridge-form-group">
        <label for="signup-first-name">{t('field.firstName')}</label>
        <input
          id="signup-first-name"
          type="text"
          placeholder={t('placeholder.firstName')}
          bind:value={firstName}
          disabled={loading}
        />
      </div>
      <div class="bridge-form-group">
        <label for="signup-last-name">{t('field.lastName')}</label>
        <input
          id="signup-last-name"
          type="text"
          placeholder={t('placeholder.lastName')}
          bind:value={lastName}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim()}>
        {#if loading}<Spinner size={16} />{:else}{t('signup.submit')}{/if}
      </button>
    </form>

    {#if footer}
      {@render footer()}
    {:else if showLoginLink}
      <div class="bridge-form-footer">
        {t('signup.loginPrompt')} <a href={effectiveLoginHref}>{t('signup.loginLink')}</a>
      </div>
    {/if}
  {/if}
</AuthFormWrapper>
