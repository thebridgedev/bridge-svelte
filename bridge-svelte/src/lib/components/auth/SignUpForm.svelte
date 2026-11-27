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

  Login security: when the app's sign-up protection is on Block, the form
  runs the invisible bot check (Cloudflare Turnstile) and sends its answer;
  it also sends how long the form took and a field people never see, which
  Bridge scores on its servers. A password from a public data leak is
  refused, or on Warn taken once the person confirms. A meter shows how
  strong the password is, never "strong" for one the app's rules refuse.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { isBridgeError, type SignInOptions } from '@nebulr-group/bridge-auth-core';
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
  import BotCheck from './BotCheck.svelte';
  import PasswordStrength from '../shared/PasswordStrength.svelte';
  import { botAnswer } from '../../core/login-security.js';

  /** Where a visit came from: campaign tags as strings, and the visitor's marketing consent (auth-core's sign-up attribution). */
  interface SignUpAttribution {
    readonly first: Readonly<Record<string, string>>;
    readonly last?: Readonly<Record<string, string>>;
    readonly marketingConsent: boolean;
  }

  interface Props extends HTMLAttributes<HTMLDivElement> {
    heading?: string | null;
    headingSnippet?: Snippet;
    /** Show the app's logo (from its App Properties in the dashboard) above the form. @default true; `false` when your page draws it itself */
    showLogo?: boolean;
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
    showLogo = true,
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
    const at = new URL(loginHref ?? `${authBase}/sign-in`, page.url.href);
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
  /** The bot check's answer, when the app asks for one; a new one is made after each sign-up sent. */
  const bot = botAnswer();
  let botRound = $state(0);
  const botCheck = $derived(invite ? undefined : options?.botCheck);
  /** A field people never see: a script that fills in every field fills it in too. */
  let website = $state('');
  let openedAt = Date.now();
  /** The password Bridge said is in a public leak, on Warn: the person may use it anyway. */
  let leakedFor = $state<string | null>(null);
  const confirmLeak = $derived(leakedFor !== null && leakedFor === password);

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
    // The session reaches this tab on its own, in memory mode too (the tabs hand each other the access token): when it does, go on signed in.
    let left = false;
    stopSession = session.subscribe((state) => {
      if (left || state.status !== 'signed-in') return;
      left = true;
      if (onSignIn) onSignIn();
      else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
    });
  }

  onMount(() => {
    openedAt = Date.now();
    getBridge()
      .signIn.options()
      .then((found) => (options = found))
      .catch(() => undefined);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await send(false);
  }

  async function send(acceptLeaked: boolean) {
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
      const leak = acceptLeaked ? { acceptLeaked: true } : {};
      if (invite) {
        // Signed in at once, in the inviting workspace: the invite's link proved the address.
        await getBridge().invites.signUp({ token: invite, ...secret, ...names, ...leak });
        if (onSignIn) onSignIn();
        else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
        return;
      }
      // On Block, the bot check's answer (it waits a moment for one); without one Bridge refuses, and the form says so.
      const turnstileToken = botCheck === undefined ? '' : await bot.take();
      await getBridge().signUp.start({
        email: address,
        ...secret,
        ...names,
        ...leak,
        ...(turnstileToken === '' ? {} : { turnstileToken }),
        formMs: Date.now() - openedAt,
        website,
        ...(workspace === 'ask' ? { workspace: workspaceName.trim() || true } : workspace ? { workspace: true } : {}),
        ...attributionOf(),
        ...planOf(),
      });
      sentTo = address;
      onSent?.(address);
      // The email link opens in a new tab, which finishes the sign-up there and tells this one.
      if (config !== null && config !== undefined && stopRelay === null) stopRelay = onSignUpFinished(config.issuer, afterConfirmed);
    } catch (error) {
      leakedFor = isBridgeError(error, 'password-leaked') && error.leakedPasswords === 'warn' && !acceptLeaked ? password : null;
      failure = errorMessage(error, t, 'signup.error.create');
      onError?.(error);
    } finally {
      loading = false;
      // Each answer of the bot check works once.
      if (botCheck !== undefined) botRound += 1;
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
  <AuthFormWrapper heading={heading === undefined ? t('signup.heading') : heading} {headingSnippet} logo={showLogo ? (options?.app.logo ?? null) : null} class={className} {style} data-bridge-sign-up-step="form" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <form onsubmit={submit}>
      {#if !invite}
        <!-- People never see this field; Bridge treats a sign-up that fills it in as a script's. -->
        <div class="bridge-hp-field" aria-hidden="true">
          <!-- A name no browser fills in by itself, so a person's autofill never trips it. -->
          <label for="signup-hp">Leave this empty</label>
          <input id="signup-hp" name="bridge-hp" type="text" tabindex="-1" autocomplete="off" data-1p-ignore data-lpignore="true" bind:value={website} />
        </div>
      {/if}
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
        <PasswordStrength {password} rules={options?.password} userInputs={[email, firstName, lastName].filter((each) => each.trim() !== '')} {t} />
        {#if confirmLeak}
          <button type="button" class="bridge-btn bridge-btn-secondary bridge-leaked-confirm" data-bridge-leaked-use-anyway onclick={() => void send(true)} disabled={loading}>
            {t('password.leaked.useAnyway')}
          </button>
        {/if}
      </div>
      {/if}
      {#if workspace === 'ask' && !invite}
        <div class="bridge-form-group">
          <label for="signup-workspace">{t('field.workspaceName')}</label>
          <input id="signup-workspace" type="text" autocomplete="organization" bind:value={workspaceName} disabled={loading} />
        </div>
      {/if}
      {#if botCheck !== undefined}
        <BotCheck siteKey={botCheck.siteKey} answer={bot} round={botRound} />
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
