<!--
  Every sign-in page from one file:

    src/routes/auth/[...bridge]/+page.svelte
    <BridgeAuthRoutes />

  Serves sign-in, sign-up, verify-email, forgot-password, set-password,
  invite, workspaces and handoff. An unknown page gets the app's own 404.

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
  import { readReturnTo } from '@nebulr-group/bridge-auth-core';
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

  function afterSwitch() {
    void goto(readReturnTo(page.url, config?.returnToParam) ?? config?.afterSignIn ?? '/', { invalidateAll: true });
  }
</script>

{#snippet body(p: AuthPage)}
  {#snippet boundHeading()}
    {@render heading?.(p)}
  {/snippet}
  {@const pageHeading = heading ? boundHeading : undefined}
  {#if p === 'sign-in'}
    <SignInForm headingSnippet={pageHeading} {messages} />
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
