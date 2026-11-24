<!--
  Sign up with email and password. Nothing is made until the person proves
  the address: Bridge emails a link to the app's verify-email page, which
  finishes the sign-up in this browser and signs in in the tab the link
  opened. This tab is told, and goes on signed in too (or, when the session
  lives in that tab only, says so). The answer is the same whether or not
  the address already has an account, so the form never says which.

  With `invite`, it signs the person up from an invite instead: the invite's
  link proved the address, so there is no email field and no email to wait
  for, and the person lands signed in, in the inviting workspace.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { SignInOptions } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { onSignUpFinished } from '../../core/link-relay.js';
  import { session } from '../../core/stores.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import SocialButtons from './SocialButtons.svelte';

  /** Where a visit came from: campaign tags as strings, and the visitor's marketing consent (auth-core's sign-up attribution). */
  interface SignUpAttribution {
    readonly first: Readonly<Record<string, string>>;
    readonly last?: Readonly<Record<string, string>>;
    readonly marketingConsent: boolean;
  }

  interface Props extends HTMLAttributes<HTMLDivElement> {
    heading?: string | null;
    headingSnippet?: Snippet;
    /** Ask for first and last name. @default true */
    showNameFields?: boolean;
    /**
     * The new person's own workspace: `true` makes one with no name yet,
     * `'ask'` asks for its name, `false` makes none. @default true
     */
    workspace?: boolean | 'ask';
    /**
     * An invite's token: sign the person up from the invite. The address is
     * the invite's, so no email field is shown and no email is sent.
     */
    invite?: string;
    /** With `invite`: called once signed in. Without it, the page goes to `auth.afterSignIn`. */
    onSignIn?: () => void;
    showLoginLink?: boolean;
    loginHref?: string;
    /**
     * Where the visit came from, sent with the sign-up for your sign-up reports: campaign tags and the visitor's
     * marketing consent. A function is read when the form is sent. Leave out for none.
     */
    attribution?: SignUpAttribution | (() => SignUpAttribution | undefined);
    /**
     * The plan the new workspace starts on, by its key: a plan-specific sign-up link. Bridge applies it when the app
     * offers that plan, and otherwise ignores it. @default the page address's `signupPlan` (or `plan`), if any
     */
    plan?: string;
    /**
     * With a plan, which of its prices: its currency (`EUR`) and interval (`month`), both or neither.
     * @default the page address's `signupCurrency` (or `currency`) and `signupRecurrenceInterval` (or `recurrenceInterval`)
     */
    currency?: string;
    interval?: 'day' | 'week' | 'month' | 'year';
    /** Called once the email is sent. */
    onSent?: (email: string) => void;
    onError?: (error: unknown) => void;
    footer?: Snippet;
    messages?: BridgeMessages;
  }

  let {
    heading = undefined,
    headingSnippet,
    showNameFields = true,
    workspace = true,
    invite = undefined,
    onSignIn,
    showLoginLink = true,
    loginHref = undefined,
    attribution = undefined,
    plan = undefined,
    currency = undefined,
    interval = undefined,
    onSent,
    onError,
    footer,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(translator(messages));

  function attributionOf(): { attribution?: SignUpAttribution } {
    const given = typeof attribution === 'function' ? attribution() : attribution;
    return given === undefined ? {} : { attribution: given };
  }

  /** The plan to sign up for: the `plan` prop, else the address's `signupPlan` or `plan`, as plan-specific links name it. */
  function planOf(): { plan?: string; currency?: string; interval?: 'day' | 'week' | 'month' | 'year' } {
    const params = page.url.searchParams;
    const chosen = plan ?? params.get('signupPlan') ?? params.get('plan') ?? '';
    if (chosen === '') return {};
    const money = currency ?? params.get('signupCurrency') ?? params.get('currency') ?? '';
    const every = (interval ?? params.get('signupRecurrenceInterval') ?? params.get('recurrenceInterval') ?? '').toLowerCase();
    const known = (['day', 'week', 'month', 'year'] as const).find((each) => each === every);
    return money === '' || known === undefined ? { plan: chosen } : { plan: chosen, currency: money, interval: known };
  }
  const config = peekConfig();
  const authBase = config?.authBase ?? '/auth';
  /** The sign-in page as an address, with this page's query (a hosted sign-in's request): where a provider's answer is finished. */
  function signInPage(): string {
    const at = new URL(loginHref ?? `${authBase}/sign-in`, page.url);
    if (at.search === '') at.search = page.url.search;
    return `${at.origin}${at.pathname}${at.search}`;
  }

  let email = $state('');
  let password = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let workspaceName = $state('');
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let sentTo = $state<string | null>(null);
  let options = $state<SignInOptions | null>(null);

  const minLength = $derived(options?.password?.minLength ?? 8);
  /** An app that offers sign-in links only takes no password: the person signs in by link. */
  const passwordOffered = $derived(options === null || options.methods.includes('password'));
  // An invite is its own way in, whether or not the app takes sign-ups.
  const closed = $derived(!invite && options !== null && !options.signUp);
  /** The email link finished the sign-up in another tab of this browser (link-relay). */
  let confirmed = $state(false);
  let stopRelay: (() => void) | null = null;
  let stopSession: (() => void) | null = null;
  onDestroy(() => {
    stopRelay?.();
    stopSession?.();
  });

  /** Once the link finished the sign-up in another tab: on, signed in, when the session reached this tab too. */
  function afterConfirmed() {
    confirmed = true;
    stopSession?.();
    // Memory only: the session lives in the tab the link opened, so this one only says so.
    if (config?.storage === 'memory') return;
    let left = false;
    stopSession = session.subscribe((state) => {
      if (left || state.status !== 'signed-in') return;
      left = true;
      if (onSignIn) onSignIn();
      else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
    });
  }

  onMount(() => {
    getBridge()
      .signIn.options()
      .then((found) => (options = found))
      .catch(() => undefined);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading) return;
    failure = null;
    if (passwordOffered && password.length < minLength) {
      failure = t('password.tooShort', { count: minLength });
      return;
    }
    loading = true;
    const secret = passwordOffered ? { password } : {};
    const address = email.trim();
    const names = {
      ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
      ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
    };
    try {
      if (invite) {
        // Signed in at once, in the inviting workspace: the invite's link proved the address.
        await getBridge().invites.signUp({ token: invite, ...secret, ...names });
        if (onSignIn) onSignIn();
        else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
        return;
      }
      await getBridge().signUp.start({
        email: address,
        ...secret,
        ...names,
        ...(workspace === 'ask' ? { workspace: workspaceName.trim() || true } : workspace ? { workspace: true } : {}),
        ...attributionOf(),
        ...planOf(),
      });
      sentTo = address;
      onSent?.(address);
      // The email link opens in a new tab, which finishes the sign-up there and tells this one.
      if (config !== null && config !== undefined && stopRelay === null) stopRelay = onSignUpFinished(config.issuer, afterConfirmed);
    } catch (error) {
      failure = errorMessage(error, t, 'signup.error.create');
      onError?.(error);
    } finally {
      loading = false;
    }
  }
</script>

{#if sentTo !== null}
  <AuthFormWrapper heading={t('signup.successHeading')} class={className} {style} data-bridge-sign-up-step="sent" {...rest}>
    {#snippet descriptionSnippet()}
      <p class="bridge-step-desc" data-bridge-sign-up-sent>{t('signup.successDescription', { email: sentTo ?? '' })}</p>
    {/snippet}
    {#if confirmed}
      <Alert variant="success" data-bridge-sign-up-confirmed>{t('signup.confirmedElsewhere')}</Alert>
    {/if}
  </AuthFormWrapper>
{:else if closed}
  <AuthFormWrapper heading={heading === undefined ? t('signup.heading') : heading} {headingSnippet} class={className} {style} data-bridge-sign-up-step="closed" {...rest}>
    <Alert variant="info">{t('signup.closed')}</Alert>
    <div class="bridge-form-footer">
      <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={heading === undefined ? t('signup.heading') : heading} {headingSnippet} class={className} {style} data-bridge-sign-up-step="form" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <form onsubmit={submit}>
      {#if showNameFields}
        <div class="bridge-form-row">
          <div class="bridge-form-group">
            <label for="signup-first-name">{t('field.firstName')}</label>
            <input id="signup-first-name" type="text" autocomplete="given-name" placeholder={t('placeholder.firstName')} bind:value={firstName} disabled={loading} />
          </div>
          <div class="bridge-form-group">
            <label for="signup-last-name">{t('field.lastName')}</label>
            <input id="signup-last-name" type="text" autocomplete="family-name" placeholder={t('placeholder.lastName')} bind:value={lastName} disabled={loading} />
          </div>
        </div>
      {/if}
      {#if !invite}
        <div class="bridge-form-group">
          <label for="signup-email">{t('field.email')}</label>
          <input id="signup-email" type="email" autocomplete="email" placeholder={t('placeholder.email')} required bind:value={email} disabled={loading} />
        </div>
      {/if}
      {#if passwordOffered}
      <div class="bridge-form-group">
        <label for="signup-password">{t('field.password')}</label>
        <PasswordInput
          id="signup-password"
          autocomplete="new-password"
          placeholder={t('placeholder.newPassword')}
          required
          minlength={minLength}
          bind:value={password}
          disabled={loading}
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
        />
      </div>
      {/if}
      {#if workspace === 'ask' && !invite}
        <div class="bridge-form-group">
          <label for="signup-workspace">{t('field.workspaceName')}</label>
          <input id="signup-workspace" type="text" autocomplete="organization" bind:value={workspaceName} disabled={loading} />
        </div>
      {/if}
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || (!invite && !email.trim()) || (passwordOffered && !password)}>
        {#if loading}<Spinner size={16} />{:else}{t('signup.submit')}{/if}
      </button>
    </form>
    {#if !invite && (options?.social ?? []).length > 0}
      <div class="bridge-divider" data-bridge-sign-up-or>{t('magicLink.or')}</div>
      <!-- The provider's answer is finished on the sign-in page, which also asks for a workspace or a second step. -->
      <SocialButtons
        providers={options?.social ?? []}
        intent="sign-up"
        returnPage={signInPage()}
        signUp={() => ({ ...planOf(), ...attributionOf(), ...(workspace === 'ask' ? { workspace: workspaceName.trim() || true } : workspace ? { workspace: true } : {}) })}
        disabled={loading}
        onError={(message, error) => { failure = message; onError?.(error); }}
        {messages}
      />
    {/if}
    {#if footer}
      {@render footer()}
    {:else if showLoginLink}
      <div class="bridge-form-footer">
        {t('signup.loginPrompt')} <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('signup.loginLink')}</a>
      </div>
    {/if}
  </AuthFormWrapper>
{/if}
