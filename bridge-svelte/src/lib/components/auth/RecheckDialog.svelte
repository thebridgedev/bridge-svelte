<!--
  "Confirm it is you": the dialog an action that wants a recent sign-in opens.
  `<BridgeBootstrap>` renders it for `confirmItIsYou()` and `withRecheck()`;
  use it directly to place it yourself.

  It is a modal over the page the person is on, never a navigation, so a form
  they were filling stays as it was. It offers only the ways the app offers
  (`bridge.recheck.methods()`): their password, one of their passkeys, or a
  link sent to their address, which this dialog waits for. `onconfirm` is
  called once the session is renewed; `oncancel` when they close it.
-->
<script lang="ts">
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import { onDestroy, onMount } from 'svelte';
  import { isBridgeError, type RecheckMethod } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import Alert from '../shared/Alert.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends Omit<HTMLDialogAttributes, 'open' | 'onclose' | 'oncancel'> {
    /** Called once the person confirmed it is them. */
    onconfirm?: () => void;
    /** Called when the person closes the dialog without confirming. */
    oncancel?: () => void;
    messages?: BridgeMessages;
  }

  let { onconfirm, oncancel, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));

  let dialog: HTMLDialogElement | undefined = $state();
  let methods = $state<RecheckMethod[] | null>(null);
  let passkeySupported = $state(false);
  let password = $state('');
  let loading = $state(false);
  let waiting = $state(false);
  let failure = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let waitFor: AbortController | null = null;
  let finished = false;

  const passwordOffered = $derived(methods?.includes('password') ?? false);
  const passkeyOffered = $derived(passkeySupported && (methods?.includes('passkeys') ?? false));
  const linkOffered = $derived(methods?.includes('magicLink') ?? false);
  const primaryIs = $derived(passwordOffered ? 'password' : passkeyOffered ? 'passkey' : 'link');

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  onMount(() => {
    const bridge = getBridge();
    bridge.recheck
      .methods()
      .then(async (offered) => {
        passkeySupported = offered.includes('passkeys') && (await bridge.passkeys.supported());
        methods = offered;
      })
      .catch((error: unknown) => {
        methods = [];
        failure = errorMessage(error, t);
      });
  });

  onDestroy(() => waitFor?.abort());

  function confirmed() {
    if (finished) return;
    finished = true;
    onconfirm?.();
  }

  function cancel() {
    if (finished) return;
    finished = true;
    waitFor?.abort();
    oncancel?.();
  }

  function fail(error: unknown) {
    if (isBridgeError(error, 'cancelled')) notice = t('recheck.passkeyCancelled');
    else if (isBridgeError(error, 'not-supported')) failure = t('passkey.unsupported');
    else if (isBridgeError(error) && error.code === 'no_passkey') failure = t('recheck.noPasskey');
    else if (isBridgeError(error, 'wrong-credentials')) failure = t('recheck.wrongPassword');
    else failure = errorMessage(error, t);
  }

  /** Runs one way of confirming; `work` answers false when it ended without confirming (the person chose another way). */
  async function attempt(work: () => Promise<boolean | void>) {
    if (loading) return;
    failure = null;
    notice = null;
    loading = true;
    try {
      if ((await work()) !== false) confirmed();
    } catch (error) {
      waiting = false;
      fail(error);
    } finally {
      loading = false;
    }
  }

  function withPassword(event: SubmitEvent) {
    event.preventDefault();
    if (!password) return;
    void attempt(async () => {
      await getBridge().recheck.password(password);
      password = '';
    });
  }

  function withPasskey() {
    void attempt(() => getBridge().recheck.passkey());
  }

  /** Sends the link, then waits here: the page the link opens renews this session, and its tokens reach this tab. */
  function withLink() {
    void attempt(async () => {
      const bridge = getBridge();
      await bridge.recheck.email();
      const stop = new AbortController();
      waitFor = stop;
      waiting = true;
      try {
        await bridge.recheck.emailOpened({ signal: stop.signal });
      } catch (error) {
        // Choosing another way, or closing the dialog, aborts the wait on purpose: that is not a failure.
        if (stop.signal.aborted && isBridgeError(error, 'cancelled')) return false;
        throw error;
      } finally {
        if (waitFor === stop) waitFor = null;
      }
    });
  }

  function anotherWay() {
    waitFor?.abort();
    waiting = false;
  }
</script>

<dialog
  bind:this={dialog}
  class={['bridge-team-dialog', 'bridge-recheck-dialog', className]}
  {style}
  data-bridge-recheck-dialog
  data-state={waiting ? 'waiting' : methods === null ? 'loading' : 'ready'}
  aria-labelledby="bridge-recheck-dialog-title"
  oncancel={(event) => {
    event.preventDefault();
    cancel();
  }}
  {...rest}
>
  <div class="bridge-team-dialog-content" data-bridge-auth-form>
    <h3 id="bridge-recheck-dialog-title" class="bridge-team-dialog-title">{t('recheck.heading')}</h3>
    <p class="bridge-team-dialog-message">{t('recheck.intro')}</p>

    {#if notice}<Alert variant="info" data-bridge-recheck-notice>{notice}</Alert>{/if}
    {#if failure}<Alert variant="error" data-bridge-recheck-error>{failure}</Alert>{/if}

    {#if methods === null}
      <div class="bridge-auth-settling" data-bridge-auth-settling><Spinner size={24} /></div>
    {:else if waiting}
      <div class="bridge-auth-settling" data-bridge-recheck-waiting>
        <Spinner size={24} />
        <span>{t('recheck.emailWaiting')}</span>
      </div>
      <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-recheck-another onclick={anotherWay}>{t('recheck.anotherWay')}</button>
    {:else}
      {#if methods.length === 0 && failure === null}<Alert variant="error">{t('recheck.noMethods')}</Alert>{/if}
      {#if passwordOffered}
        <form onsubmit={withPassword} data-bridge-recheck-password-form>
          <div class="bridge-form-group">
            <label for="recheck-password">{t('field.password')}</label>
            <PasswordInput
              id="recheck-password"
              autocomplete="current-password"
              placeholder={t('placeholder.password')}
              required
              bind:value={password}
              disabled={loading}
              showLabel={t('action.showPassword')}
              hideLabel={t('action.hidePassword')}
            />
          </div>
          <button type="submit" class="bridge-btn bridge-btn-primary" data-bridge-recheck-submit disabled={loading || !password}>
            {#if loading}<Spinner size={16} /> {t('recheck.submitting')}{:else}{t('recheck.submit')}{/if}
          </button>
        </form>
      {/if}
      {#if passkeyOffered}
        {#if passwordOffered}<div class="bridge-divider">{t('magicLink.or')}</div>{/if}
        <button
          type="button"
          class="bridge-btn {primaryIs === 'passkey' ? 'bridge-btn-primary' : 'bridge-btn-secondary'}"
          data-bridge-recheck-passkey
          onclick={withPasskey}
          disabled={loading}
        >
          {t('recheck.passkey')}
        </button>
      {/if}
      {#if linkOffered}
        {#if passwordOffered || passkeyOffered}<div class="bridge-divider">{t('magicLink.or')}</div>{/if}
        <button
          type="button"
          class="bridge-btn {primaryIs === 'link' ? 'bridge-btn-primary' : 'bridge-btn-secondary'}"
          data-bridge-recheck-email
          onclick={withLink}
          disabled={loading}
        >
          {t('recheck.email')}
        </button>
      {/if}
    {/if}

    <div class="bridge-form-footer">
      <button type="button" class="bridge-link" data-bridge-recheck-cancel onclick={cancel}>{t('recheck.cancel')}</button>
    </div>
  </div>
</dialog>
