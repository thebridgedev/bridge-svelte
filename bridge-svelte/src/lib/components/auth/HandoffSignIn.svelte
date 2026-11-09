<!--
  Hand-off mode: signs the person in for a program on their own machine, such
  as a command-line tool, and sends the code back to the program's loopback
  address. The program trades the code with its own verifier; no token ever
  reaches this page, and this page's own session is not touched.

  It renders only when bridgeBootstrap has `handoff: { loopback: true }`, and
  it refuses any request whose return address is not `http://127.0.0.1:<port>`
  or `http://[::1]:<port>`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { handoffSignIn, readHandoff, returnToProgram, type HandoffState } from '../../core/handoff.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import WorkspaceChooser from './WorkspaceChooser.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The program's name, for the copy. @default bridgeBootstrap's `handoff.program` */
    program?: string;
    headingSnippet?: Snippet;
    /** Called with the address the browser is about to go to. */
    onDone?: (returnUrl: string) => void;
    messages?: BridgeMessages;
  }

  let { program = undefined, headingSnippet, onDone, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const handoff = peekConfig()?.handoff ?? null;
  const name = $derived(program ?? handoff?.program ?? '');

  let view = $state<HandoffState | null>(null);
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let failure = $state<string | null>(null);

  onMount(() => {
    view = readHandoff(page.url.searchParams);
  });

  function settle(next: HandoffState) {
    view = next;
    if (next.status === 'done') {
      onDone?.(next.returnUrl);
      returnToProgram(next);
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading || view?.status !== 'ready') return;
    failure = null;
    loading = true;
    try {
      settle(await handoffSignIn(getBridge(), view.request, { email: email.trim(), password }));
    } catch (error) {
      failure = errorMessage(error, t, 'login.error.invalidCredentials');
    } finally {
      loading = false;
    }
  }

  async function choose(id: string) {
    if (view?.status !== 'workspace') return;
    try {
      settle(await view.choose(id));
    } catch (error) {
      failure = errorMessage(error, t, 'workspace.error.select');
    }
  }
</script>

{#if handoff === null}
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-handoff="not-offered" {...rest}>
    <Alert variant="info">{t('handoff.notOffered')}</Alert>
  </AuthFormWrapper>
{:else if view === null}
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-handoff="loading" {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling><Spinner size={24} /></div>
  </AuthFormWrapper>
{:else if view.status === 'invalid'}
  <AuthFormWrapper heading={t('handoff.heading', { program: name })} {headingSnippet} class={className} {style} data-bridge-handoff="invalid" {...rest}>
    <Alert variant="error">{t('handoff.invalid', { program: name })}</Alert>
  </AuthFormWrapper>
{:else if view.status === 'done'}
  <AuthFormWrapper heading={t('handoff.heading', { program: name })} {headingSnippet} class={className} {style} data-bridge-handoff="done" {...rest}>
    <Alert variant="success">{t('handoff.done', { program: name })}</Alert>
  </AuthFormWrapper>
{:else if view.status === 'workspace'}
  <AuthFormWrapper heading={t('workspace.chooseHeading')} class={className} {style} data-bridge-handoff="workspace" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <WorkspaceChooser workspaces={view.workspaces} onChoose={choose} {messages} />
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={t('handoff.heading', { program: name })} {headingSnippet} class={className} {style} data-bridge-handoff="form" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <form onsubmit={submit}>
      <div class="bridge-form-group">
        <label for="handoff-email">{t('field.email')}</label>
        <input id="handoff-email" type="email" autocomplete="username" placeholder={t('placeholder.email')} required bind:value={email} disabled={loading} />
      </div>
      <div class="bridge-form-group">
        <label for="handoff-password">{t('field.password')}</label>
        <PasswordInput
          id="handoff-password"
          autocomplete="current-password"
          placeholder={t('placeholder.password')}
          required
          bind:value={password}
          disabled={loading}
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim() || !password}>
        {#if loading}<Spinner size={16} /> {t('login.submitting')}{:else}{t('login.submit')}{/if}
      </button>
    </form>
  </AuthFormWrapper>
{/if}
