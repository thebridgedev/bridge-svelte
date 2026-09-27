<!--
  TBP-696 — every auth page from one file.

    src/routes/auth/[...bridge]/+page.svelte:
    <BridgeAuthRoutes />

  Serves login, signup, oauth-callback, set-password/[token], forgot-password,
  magic-link, setup-passkey/[token] and workspaces. An unknown segment gets the
  app's own 404 (bridgeBootstrap's load throws it — a component cannot).

  Customising, in rungs:
    1. `--bridge-*` CSS tokens restyle the forms.
    2. `frame(page, children)` replaces everything around the form on every page;
       `heading(page)` replaces the form heading on each page's main step.
    3. To own one page outright, create it (`src/routes/auth/login/+page.svelte`):
       SvelteKit prefers the specific route over `[...bridge]`, and the other
       pages keep working.
    4. Headless: build on `getBridgeAuth()`.

  Which sign-in methods show (magic link, passkeys, SSO) comes from the app's
  auth config at runtime, so an operator toggles them without a deploy.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { get } from 'svelte/store';
  import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { readReturnTo, withReturnTo } from '@nebulr-group/bridge-auth-core';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getBridgeAuth, isAuthenticated } from '../../../core/bridge-instance.js';
  import { getConfig } from '../../stores/config.store.js';
  import { getTranslator } from '../../stores/i18n.js';
  import {
    BRIDGE_AUTH_ROUTE_PARAM,
    bridgeAuthBase,
    parseBridgeAuthRoute,
    type BridgeAuthPage,
  } from '../../auth-routes.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import LoginForm from './LoginForm.svelte';
  import SignupForm from './SignupForm.svelte';
  import ForgotPassword from './ForgotPassword.svelte';
  import MagicLink from './MagicLink.svelte';
  import PasskeySetup from './PasskeySetup.svelte';
  import WorkspaceSelector from './WorkspaceSelector.svelte';

  interface Props {
    /**
     * Everything around the form, on every page. Receives the page name and the
     * form to render. Replaces the default centred container entirely.
     */
    frame?: Snippet<[BridgeAuthPage, Snippet]>;
    /**
     * The form heading, per page. Shown on each page's main step only — the
     * login credentials step, the signup form, the set-password form — so it
     * never stacks above a sub-step's own heading ("Reset your password",
     * "Check your email").
     */
    heading?: Snippet<[BridgeAuthPage]>;
    /** Where a completed sign-in, passkey setup or workspace switch lands when
     *  there is no `?redirectUri=` deep link to return to. @default '/' */
    redirectTo?: string;
    /** Per-key copy overrides, passed to every form. */
    messages?: MessageOverrides;
  }

  let { frame, heading, redirectTo = '/', messages }: Props = $props();

  const t = $derived(getTranslator(messages));

  const rest = $derived($page.params[BRIDGE_AUTH_ROUTE_PARAM]);
  const route = $derived(parseBridgeAuthRoute(rest));
  const base = $derived(bridgeAuthBase($page.url.pathname, rest));
  const loginHref = $derived(`${base}/login`);
  const signupHref = $derived(`${base}/signup`);

  // Hosted mode is "no loginRoute" — the same switch the route guard uses.
  const hosted = $derived.by(() => {
    try {
      return !getConfig().loginRoute;
    } catch {
      return false;
    }
  });

  function hostedHref(p: BridgeAuthPage): string | null {
    try {
      const auth = getBridgeAuth();
      return p === 'signup' ? auth.createSignupUrl() : auth.createLoginUrl();
    } catch {
      return null;
    }
  }

  function afterSignIn() {
    goto(readReturnTo($page.url) ?? redirectTo);
  }

  // A magic link returns to the page it was requested from. On /magic-link,
  // MagicLink redeems it but — unlike LoginForm — has no `onLogin`, so the
  // sign-in it completes is picked up here. Only a transition counts: a user
  // who was already signed in when the page opened is not bounced away.
  let wasAuthenticated = get(isAuthenticated);
  $effect(() => {
    const now = $isAuthenticated;
    if (now && !wasAuthenticated && route?.page === 'magic-link') afterSignIn();
    wasAuthenticated = now;
  });

  // The workspace list needs a session. `/auth/*` is public, so a signed-out
  // visitor can land here; send them to sign in and back.
  $effect(() => {
    if (route?.page === 'workspaces' && !hosted && !$isAuthenticated) {
      goto(withReturnTo(loginHref, `${$page.url.pathname}${$page.url.search}`), { replaceState: true });
    }
  });
</script>

{#snippet body(p: BridgeAuthPage)}
  <!-- `heading(page)` in the zero-argument shape the forms' `headingSnippet` takes. -->
  {#snippet boundHeading()}
    {@render heading?.(p)}
  {/snippet}
  {@const pageHeading = heading ? boundHeading : undefined}
  <!-- Hosted mode: every sign-in page points at the hosted login instead. A
       signed-in user switching workspace is not signing in, so that stays. -->
  {#if hosted && !(p === 'workspaces' && $isAuthenticated)}
    <AuthFormWrapper
      heading={t(p === 'signup' ? 'signup.heading' : 'login.heading')}
      headingSnippet={pageHeading}
      data-bridge-auth-hosted
    >
      <p class="bridge-step-desc">
        Sign-in for this app happens on its hosted login page, not here.
      </p>
      {@const href = hostedHref(p)}
      {#if href}
        <a class="bridge-btn bridge-btn-primary" {href}>
          {t(p === 'signup' ? 'signup.submit' : 'login.submit')}
        </a>
      {/if}
    </AuthFormWrapper>
  {:else if p === 'login'}
    <LoginForm headingSnippet={pageHeading} {signupHref} onLogin={afterSignIn} {messages} />
  {:else if p === 'signup'}
    <SignupForm showLoginLink {loginHref} headingSnippet={pageHeading} {messages} />
  {:else if p === 'set-password'}
    <ForgotPassword token={route?.token} {loginHref} headingSnippet={pageHeading} {messages} />
  {:else if p === 'forgot-password'}
    <ForgotPassword {loginHref} headingSnippet={pageHeading} {messages} />
  {:else if p === 'magic-link'}
    <MagicLink {loginHref} headingSnippet={pageHeading} {messages} />
  {:else if p === 'setup-passkey' && route?.token}
    {#key route.token}
      <PasskeySetup
        token={route.token}
        headingSnippet={pageHeading}
        onComplete={afterSignIn}
        onBack={() => goto(loginHref)}
        onExpired={() => goto(loginHref)}
        {messages}
      />
    {/key}
  {:else if p === 'workspaces' && $isAuthenticated}
    <AuthFormWrapper heading={t('tenant.chooseHeading')} headingSnippet={pageHeading}>
      <WorkspaceSelector onSwitch={() => goto(readReturnTo($page.url) ?? redirectTo)} {messages} />
    </AuthFormWrapper>
  {/if}
{/snippet}

<!--
  oauth-callback renders nothing: bridgeBootstrap's load exchanges the code and
  redirects before this mounts. In hosted mode it is the one page that is not
  hosted, so the same holds there.
-->
{#if route && route.page !== 'oauth-callback'}
  {@const current = route.page}
  {#snippet form()}
    {@render body(current)}
  {/snippet}
  <div data-bridge-auth-route={current} style="display: contents">
    {#if frame}
      {@render frame(current, form)}
    {:else}
      <div class="bridge-auth-page">
        {@render form()}
      </div>
    {/if}
  </div>
{:else if route}
  <div data-bridge-auth-route={route.page} style="display: contents"></div>
{/if}

<style>
  /* The default frame — the centred container every guide page used to paste.
     A `frame` snippet replaces it entirely. */
  .bridge-auth-page {
    display: flex;
    justify-content: center;
    padding: var(--bridge-auth-page-padding, 3rem 1rem);
  }
</style>
