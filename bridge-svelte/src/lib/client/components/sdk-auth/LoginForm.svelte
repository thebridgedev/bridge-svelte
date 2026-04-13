<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { AppConfig, FederationConnection } from '@thebridge/auth-core';
  import { onMount } from 'svelte';
  import { getBridgeAuth, authState, appConfigStore, ensureAppConfig } from '../../../core/bridge-instance.js';
  import { getConfig } from '../../stores/config.store.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';
  import SsoButton from './SsoButton.svelte';
  import SsoProviderIcon from './SsoProviderIcon.svelte';
  import MfaChallenge from './MfaChallenge.svelte';
  import MfaSetup from './MfaSetup.svelte';
  import TenantSelector from './TenantSelector.svelte';
  import PasskeyLogin from './PasskeyLogin.svelte';
  import PasskeyRequestSetupLink from './PasskeyRequestSetupLink.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Override signup link visibility. Default: derived from app config (signupEnabled). */
    showSignupLink?: boolean | undefined;
    /** Override signup page URL. Default: derived from BridgeConfig signupRoute. */
    signupHref?: string | undefined;
    /** Override forgot password visibility. Default: derived from app config (true when password auth is available). */
    showForgotPassword?: boolean | undefined;
    forgotPasswordHref?: string;
    /** Override magic link visibility. Default: derived from app config (magicLinkEnabled). */
    showMagicLink?: boolean | undefined;
    /** Override passkey visibility. Default: derived from app config (passkeysEnabled). */
    showPasskeys?: boolean | undefined;
    onLogin?: () => void;
    onError?: (error: Error) => void;
    onSsoClick?: (connectionType: string) => void;
    heading?: string;
    ssoConnections?: FederationConnection[];
    /**
     * SSO kickoff strategy for the built-in SsoButtons.
     * - 'redirect' (default): full-page navigation to the federation endpoint.
     * - 'popup': opens window.open and resolves via postMessage.
     * Ignored when `onSsoClick` is provided (the caller handles the click).
     */
    ssoMode?: 'redirect' | 'popup';
    footer?: Snippet;
  }

  let {
    showSignupLink = undefined,
    signupHref = undefined,
    showForgotPassword = undefined,
    forgotPasswordHref,
    showMagicLink = undefined,
    showPasskeys = undefined,
    onLogin,
    onError,
    onSsoClick,
    heading = '',
    ssoConnections = [],
    ssoMode = 'redirect',
    footer,
    class: className,
    style,
    ...rest
  }: Props = $props();

  type Step = 'credentials' | 'forgot-password' | 'magic-link' | 'passkey-request';

  let step = $state<Step>('credentials');
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let showPassword = $state(false);

  // Forgot password inline state
  let fpEmailSent = $state(false);
  let fpLoading = $state(false);

  // Magic link inline state
  let mlSent = $state(false);
  let mlExpiresIn = $state(0);
  let mlLoading = $state(false);

  function buildSsoConnections(appConfig: AppConfig | null): FederationConnection[] {
    if (!appConfig) return [];
    const out: FederationConnection[] = [];
    if (appConfig.googleSsoEnabled)   out.push({ id: 'google',   type: 'google',      name: 'Google' });
    if (appConfig.azureAdSsoEnabled)  out.push({ id: 'azure',    type: 'ms-azure-ad', name: 'Microsoft' });
    if (appConfig.linkedinSsoEnabled) out.push({ id: 'linkedin', type: 'linkedin',    name: 'LinkedIn' });
    if (appConfig.githubSsoEnabled)   out.push({ id: 'github',   type: 'github',      name: 'GitHub' });
    if (appConfig.facebookSsoEnabled) out.push({ id: 'facebook', type: 'facebook',    name: 'Facebook' });
    if (appConfig.appleSsoEnabled)    out.push({ id: 'apple',    type: 'apple',       name: 'Apple' });
    return out;
  }

  // ssoConnections prop overrides auto-derived; when empty, derive from app config
  let effectiveSsoConnections = $derived(
    ssoConnections.length > 0 ? ssoConnections : buildSsoConnections($appConfigStore)
  );

  // Derive auth method visibility from app config when props are not explicitly set
  let effectiveShowMagicLink = $derived(showMagicLink ?? ($appConfigStore?.magicLinkEnabled ?? false));
  let effectiveShowPasskeys = $derived(showPasskeys ?? ($appConfigStore?.passkeysEnabled ?? false));
  let effectiveShowForgotPassword = $derived(showForgotPassword ?? true);
  let effectiveShowSignupLink = $derived(showSignupLink ?? ($appConfigStore?.signupEnabled ?? true));
  let effectiveSignupHref = $derived(signupHref ?? getConfig().signupRoute);

  // State-driven rendering: when authState changes, override local step
  let currentAuthState = $derived($authState);

  async function handleSubmit() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().authenticate(email, password);
      // authState store will drive MFA / tenant-selection / authenticated transitions
    } catch (err: any) {
      error = err.message || 'Invalid email or password.';
      onError?.(err);
      loading = false;
    }
  }

  async function handleForgotSend() {
    if (fpLoading) return;
    error = null;
    fpLoading = true;
    try {
      await getBridgeAuth().sendResetPasswordLink(email);
      fpEmailSent = true;
    } catch (err: any) {
      error = err.message || 'Failed to send reset link.';
    } finally {
      fpLoading = false;
    }
  }

  async function handleMagicLinkSend() {
    if (mlLoading) return;
    error = null;
    mlLoading = true;
    try {
      const result = await getBridgeAuth().sendMagicLink(email);
      mlExpiresIn = result.expiresIn;
      mlSent = true;
    } catch (err: any) {
      error = err.message || 'Failed to send magic link.';
    } finally {
      mlLoading = false;
    }
  }

  function goBackToCredentials() {
    error = null;
    fpEmailSent = false;
    mlSent = false;
    step = 'credentials';
  }

  function formatExpiry(seconds: number): string {
    if (seconds >= 60) {
      return `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) !== 1 ? 's' : ''}`;
    }
    return `${seconds} seconds`;
  }

  $effect(() => {
    if (currentAuthState === 'authenticated') {
      onLogin?.();
    }
  });

  onMount(async () => {
    if (typeof window === 'undefined') return;

    // Ensure the anonymous app config is loaded. `initBridge()` kicks off the
    // same fetch on startup, but LoginForm can mount before that promise
    // settles (slow network, failed init, etc.), so we call it again here.
    // `ensureAppConfig()` is idempotent and logs errors — the store update
    // triggers reactivity and the SSO buttons / magic-link / passkey toggles
    // render when it resolves.
    void ensureAppConfig();

    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('bridge_magic_link_token');
    if (!magicToken) return;

    // Remove token from URL without reloading
    params.delete('bridge_magic_link_token');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState({}, '', newUrl);

    loading = true;
    error = null;
    try {
      await getBridgeAuth().authenticateWithMagicLinkToken(magicToken);
      // authState effect handles onLogin callback
    } catch (err: any) {
      error = err.message || 'Magic link authentication failed.';
      onError?.(err);
      loading = false;
    }
  });
</script>

<!-- Auth state overrides: MFA / Tenant Selection -->
{#if currentAuthState === 'mfa-required'}
  <MfaChallenge onError={onError} />

{:else if currentAuthState === 'mfa-setup-required'}
  <MfaSetup onError={onError} />

{:else if currentAuthState === 'tenant-selection'}
  <TenantSelector onError={onError} />

<!-- Inline forgot password -->
{:else if step === 'forgot-password'}
  <AuthFormWrapper heading="Reset your password">
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}
    {#if fpEmailSent}
      <Alert variant="success">Check your email for a password reset link.</Alert>
      <div class="bridge-form-footer">
        <button type="button" class="bridge-link" onclick={goBackToCredentials}>Back to login</button>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); handleForgotSend(); }}>
        <div class="bridge-form-group">
          <label for="forgot-email">Email</label>
          <input
            id="forgot-email"
            type="email"
            placeholder="you@example.com"
            required
            bind:value={email}
            disabled={fpLoading}
          />
        </div>
        <button
          type="submit"
          class="bridge-btn bridge-btn-primary"
          disabled={fpLoading || !email.trim()}
        >
          {#if fpLoading}<Spinner size={16} />{:else}Send reset link{/if}
        </button>
      </form>
      <div class="bridge-form-footer">
        <button type="button" class="bridge-link" onclick={goBackToCredentials}>Back to login</button>
      </div>
    {/if}
  </AuthFormWrapper>

<!-- Inline magic link -->
{:else if step === 'magic-link'}
  <AuthFormWrapper heading="Sign in with email link">
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}
    {#if mlSent}
      <Alert variant="success">Check your email — link expires in {formatExpiry(mlExpiresIn)}.</Alert>
      <div class="bridge-form-footer">
        <button type="button" class="bridge-link" onclick={goBackToCredentials}>Back to login</button>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); handleMagicLinkSend(); }}>
        <div class="bridge-form-group">
          <label for="magic-link-email">Email</label>
          <input
            id="magic-link-email"
            type="email"
            placeholder="you@example.com"
            required
            bind:value={email}
            disabled={mlLoading}
          />
        </div>
        <button
          type="submit"
          class="bridge-btn bridge-btn-primary"
          disabled={mlLoading || !email.trim()}
        >
          {#if mlLoading}<Spinner size={16} />{:else}Send magic link{/if}
        </button>
      </form>
      <div class="bridge-form-footer">
        <button type="button" class="bridge-link" onclick={goBackToCredentials}>Back to login</button>
      </div>
    {/if}
  </AuthFormWrapper>

<!-- Inline passkey request -->
{:else if step === 'passkey-request'}
  <PasskeyRequestSetupLink initialEmail={email} onBack={goBackToCredentials} />

<!-- Credentials step (email + password together) -->
{:else}
  <AuthFormWrapper {heading} class={className} {style} {...rest}>
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="bridge-form-group">
        <label for="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          required
          bind:value={email}
          disabled={loading}
        />
      </div>

      <div class="bridge-form-group">
        <label for="login-password">Password</label>
        <div class="bridge-password-wrapper">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            required
            bind:value={password}
            disabled={loading}
          />
          <button
            type="button"
            class="bridge-password-toggle"
            onclick={() => showPassword = !showPassword}
            tabindex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {#if showPassword}
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {/if}
          </button>
        </div>
      </div>

      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim() || !password}>
        {#if loading}<Spinner size={16} /> Signing in…{:else}Sign in{/if}
      </button>

      {#if effectiveShowForgotPassword}
        <div class="bridge-forgot-row">
          {#if forgotPasswordHref}
            <a href={forgotPasswordHref} class="bridge-link">Forgot password?</a>
          {:else}
            <button type="button" class="bridge-link" onclick={() => { step = 'forgot-password'; error = null; }}>
              Forgot password?
            </button>
          {/if}
        </div>
      {/if}
    </form>

    {#if effectiveShowPasskeys || effectiveShowMagicLink || effectiveSsoConnections.length > 0}
      <div class="bridge-divider">or</div>
    {/if}

    {#if effectiveShowPasskeys}
      <div class="bridge-sso-row">
        <PasskeyLogin onLogin={onLogin} onError={onError} onSetupPasskey={() => { step = 'passkey-request'; error = null; }} class="bridge-btn bridge-btn-secondary bridge-sso-btn" />
      </div>
    {/if}

    {#if effectiveShowMagicLink}
      <div class="bridge-sso-row">
        <button
          type="button"
          class="bridge-btn bridge-btn-secondary bridge-sso-btn"
          onclick={() => { step = 'magic-link'; error = null; }}
        >
          <span class="bridge-sso-btn-inner">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              <g transform="translate(0, 0) scale(0.3)">
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="currentColor" stroke="none"/>
              </g>
              <g transform="translate(15, 17) scale(0.25)">
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="currentColor" stroke="none"/>
              </g>
              <g transform="translate(19, 15) scale(0.14)">
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="currentColor" stroke="none"/>
              </g>
            </svg>
            <span>Sign in with Magic Link</span>
          </span>
        </button>
      </div>
    {/if}

    {#each effectiveSsoConnections as conn (conn.id)}
      <div class="bridge-sso-row">
        {#if onSsoClick}
          <button
            type="button"
            class="bridge-btn bridge-btn-secondary bridge-sso-btn"
            onclick={() => onSsoClick(conn.type)}
          >
            <SsoProviderIcon type={conn.type} />
            <span>{conn.name}</span>
          </button>
        {:else}
          <SsoButton
            connection={conn}
            mode={ssoMode}
            onSuccess={onLogin}
            onError={onError}
            class="bridge-btn bridge-btn-secondary bridge-sso-btn"
          >
            {#snippet icon()}
              <SsoProviderIcon type={conn.type} />
            {/snippet}
          </SsoButton>
        {/if}
      </div>
    {/each}

    {#if footer}
      {@render footer()}
    {:else if effectiveShowSignupLink}
      <div class="bridge-form-footer">
        Don't have an account? <a href={effectiveSignupHref}>Sign up</a>
      </div>
    {/if}
  </AuthFormWrapper>
{/if}
