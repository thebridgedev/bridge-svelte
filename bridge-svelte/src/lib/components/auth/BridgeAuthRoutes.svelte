<!--
  Every sign-in page from one file:

    src/routes/auth/[...bridge]/+page.svelte
    <BridgeAuthRoutes />

  Serves sign-in (also at `login`, the app's own sign-in path), sign-up, verify-email, forgot-password, set-password,
  invite, workspaces, handoff, magic-link (a sign-in link's landing), passkey-setup (a passkey setup link's landing)
  and callback (hosted mode's return from Bridge's page). An unknown page gets the app's own 404.

  Customising, in rungs:
    1. `--bridge-*` CSS tokens restyle the forms.
    2. `frame(page, form)` replaces everything around the form on every page;
       `heading(page)` replaces the form's heading on each page.
    3. To own one page, create it (`src/routes/auth/sign-in/+page.svelte`):
       SvelteKit prefers the specific route, and the other pages keep working.
    4. Headless: build on `getBridge()`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { readReturnTo, signInPlaceOf, signsInOnHostedPage } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import Spinner from '../shared/Spinner.svelte';
  import { peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import { parseAuthPage, ROUTE_PARAM, type AuthPage } from '../../core/routes.js';
  import { signedIn } from '../../core/stores.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import SignInForm from './SignInForm.svelte';
  import SignUpForm from './SignUpForm.svelte';
  import VerifyEmail from './VerifyEmail.svelte';
  import ForgotPassword from './ForgotPassword.svelte';
  import SetPassword from './SetPassword.svelte';
  import InviteLanding from './InviteLanding.svelte';
  import WorkspaceChooser from './WorkspaceChooser.svelte';
  import HandoffSignIn from './HandoffSignIn.svelte';
  import MagicLinkLanding from './MagicLinkLanding.svelte';
  import PasskeySetupLanding from './PasskeySetupLanding.svelte';
  import HostedSignIn from './HostedSignIn.svelte';
  import HostedCallback from './HostedCallback.svelte';

  interface Props {
    /** Replaces everything around the form, on every page. */
    frame?: Snippet<[AuthPage, Snippet]>;
    /** Replaces the form's heading, per page. */
    heading?: Snippet<[AuthPage]>;
    messages?: BridgeMessages;
  }

  let { frame, heading, messages }: Props = $props();

  const t = $derived(translator(messages));
  const current = $derived(parseAuthPage(page.params[ROUTE_PARAM]));
  const config = peekConfig();

  /**
   * Where users sign in, as the app's "Your app" setting says (TBP-871): on Bridge's pages, the sign-in and sign-up
   * pages hand over to Bridge's hosted page, with no code change. Asked once; an app whose code sets `hosted`, or a page
   * that signs in for other apps, decides by its config as before. Null while asked.
   */
  const asks = !config?.hosted && !config?.signInRequests;
  let onHosted = $state<boolean | null>(asks ? null : false);
  /** Where Bridge's page sends the person back then: the app's return path, which is valid on every address it lists. */
  let hostedReturn = $state<string | undefined>(undefined);
  onMount(() => {
    if (!asks) return;
    getBridge()
      .signIn.options()
      .then((found) => {
        const place = signInPlaceOf(found);
        if (place !== null) hostedReturn = new URL(place.returnPath, location.origin).toString();
        onHosted = signsInOnHostedPage(found);
      })
      .catch(() => (onHosted = false));
  });

  function afterSwitch() {
    void goto(readReturnTo(page.url.href, config?.returnToParam) ?? config?.afterSignIn ?? '/', { invalidateAll: true });
  }
</script>

{#snippet body(p: AuthPage)}
  {#snippet boundHeading()}
    {@render heading?.(p)}
  {/snippet}
  {@const pageHeading = heading ? boundHeading : undefined}
  {#if (p === 'sign-in' || p === 'sign-up') && onHosted === null}
    <div class="bridge-auth-settling" data-bridge-auth-settling><Spinner size={24} /></div>
  {:else if p === 'sign-in' && config?.hosted}
    <HostedSignIn headingSnippet={pageHeading} {messages} />
  {:else if (p === 'sign-in' || p === 'sign-up') && onHosted}
    <HostedSignIn headingSnippet={pageHeading} {messages} page={p} redirectUri={hostedReturn} />
  {:else if p === 'sign-in'}
    <SignInForm headingSnippet={pageHeading} {messages} />
  {:else if p === 'callback'}
    <HostedCallback headingSnippet={pageHeading} {messages} />
  {:else if p === 'sign-up'}
    <SignUpForm headingSnippet={pageHeading} {messages} />
  {:else if p === 'verify-email'}
    <VerifyEmail headingSnippet={pageHeading} {messages} />
  {:else if p === 'forgot-password'}
    <ForgotPassword headingSnippet={pageHeading} {messages} />
  {:else if p === 'set-password'}
    <SetPassword headingSnippet={pageHeading} {messages} />
  {:else if p === 'invite'}
    <InviteLanding headingSnippet={pageHeading} {messages} />
  {:else if p === 'magic-link'}
    <MagicLinkLanding headingSnippet={pageHeading} {messages} />
  {:else if p === 'passkey-setup'}
    <PasskeySetupLanding headingSnippet={pageHeading} {messages} />
  {:else if p === 'handoff'}
    <HandoffSignIn headingSnippet={pageHeading} {messages} />
  {:else if p === 'workspaces'}
    {#if $signedIn}
      <AuthFormWrapper heading={t('workspace.chooseHeading')} headingSnippet={pageHeading}>
        <WorkspaceChooser onSwitch={afterSwitch} {messages} />
      </AuthFormWrapper>
    {:else}
      <SignInForm headingSnippet={pageHeading} {messages} />
    {/if}
  {/if}
{/snippet}

{#if current}
  {@const p = current}
  {#snippet form()}
    {@render body(p)}
  {/snippet}
  <div data-bridge-auth-route={p} style="display: contents">
    {#if frame}
      {@render frame(p, form)}
    {:else}
      <div class="bridge-auth-page">
        {@render form()}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* In the `bridge` layer with the stylesheet, so any CSS of the app wins. */
  @layer bridge {
    .bridge-auth-page {
      display: flex;
      justify-content: center;
      padding: var(--bridge-auth-page-padding, 3rem 1rem);
    }
  }
</style>
