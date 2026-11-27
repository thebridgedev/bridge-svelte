<!--
  The Email part of My profile: the address the person signs in with, and
  "Change email". A change asks for a recent sign-in when Bridge wants one
  (the "confirm it is you" dialog), then waits for the link in the current
  inbox, then the one in the new inbox; the old address works until both are
  opened. An address that Google or a company's sign-in manages is read-only:
  "Managed by Google".
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { isBridgeError, type MyLogin } from '@nebulr-group/bridge-auth-core';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { cancelEmailChange, loadLogin, newEmailProblem, providerName, startEmailChange } from '../../core/profile.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLElement> {
    /** The address to show while Bridge cannot change it yet (an issuer that does not offer the change). */
    email?: string;
    /** The language to show in. @default the app's */
    locale?: string | null;
    /** Called after a change was asked for or cancelled, with the login as it is now. */
    onChange?: (login: MyLogin) => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { email = undefined, locale = undefined, onChange, onError, messages, class: className, ...rest }: Props = $props();

  const t = $derived(translator(messages, locale));
  let login = $state<MyLogin | null>(null);
  let loadFailed = $state<string | null>(null);
  /** False on an issuer that does not offer the change yet: the address shows, read-only, with nothing to press. */
  let offered = $state(true);
  let editing = $state(false);
  let next = $state('');
  let busy = $state(false);
  let failure = $state<string | null>(null);

  const managed = $derived(offered && login !== null && (login.managedBy !== null || !login.emailChangeable));
  const provider = $derived(providerName(login?.managedBy));

  onMount(() => {
    loadLogin().then(
      (value) => (login = value),
      (error: unknown) => {
        if (isBridgeError(error, 'not-offered') && email !== undefined) {
          offered = false;
          login = { email, emailChangeable: false, managedBy: null, pendingChange: null };
          return;
        }
        loadFailed = errorMessage(error, t);
        onError?.(error);
      },
    );
  });

  function fail(error: unknown) {
    failure = isBridgeError(error, 'cancelled') ? null : errorMessage(error, t);
    if (isBridgeError(error, 'managed-by-provider') && login !== null) login = { ...login, emailChangeable: false, managedBy: error.provider };
    onError?.(error);
  }

  async function send() {
    if (busy || login === null) return;
    const problem = newEmailProblem(login.email, next);
    if (problem !== null) {
      failure = t(problem === 'same' ? 'profile.email.same' : 'profile.email.invalid');
      return;
    }
    busy = true;
    failure = null;
    try {
      login = await startEmailChange(next);
      editing = false;
      next = '';
      onChange?.(login);
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
    }
  }

  async function cancel() {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      login = await cancelEmailChange();
      onChange?.(login);
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
    }
  }
</script>

<section class="bridge-profile-section {className ?? ''}" data-bridge-profile-email={login === null ? 'loading' : !offered ? 'not-offered' : managed ? 'managed' : login.pendingChange ? `pending-${login.pendingChange.stage}` : editing ? 'editing' : 'ready'} {...rest}>
  <h4 class="bridge-profile-section-title">{t('profile.email.heading')}</h4>
  {#if login === null}
    {#if loadFailed}<Alert variant="error">{loadFailed}</Alert>{:else}<Spinner size={16} />{/if}
  {:else}
    <div class="bridge-team-form-group">
      <label for="bridge-profile-email">{t('field.email')}</label>
      <input id="bridge-profile-email" type="email" value={login.email} readonly data-bridge-profile-email-current />
    </div>
    {#if failure}<Alert variant="error" data-bridge-profile-email-error>{failure}</Alert>{/if}

    {#if !offered}
      <!-- The issuer does not offer the change yet: the address only. -->
    {:else if managed}
      <p class="bridge-profile-managed" data-bridge-profile-email-managed>
        <strong>{t('profile.email.managed', { provider })}</strong>
        <span class="bridge-profile-hint">{t('profile.email.managedHint', { provider })}</span>
      </p>
    {:else if login.pendingChange}
      <Alert variant="info" data-bridge-profile-email-pending={login.pendingChange.stage}>
        {login.pendingChange.stage === 'current'
          ? t('profile.email.checkCurrent', { email: login.email })
          : t('profile.email.checkNew', { email: login.pendingChange.newEmail })}
        {t('profile.email.keepsWorking', { email: login.email })}
      </Alert>
      <div class="bridge-team-form-actions">
        <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-profile-email-cancel-change onclick={cancel} disabled={busy}>
          {t('profile.email.cancelChange')}
        </button>
      </div>
    {:else if editing}
      <form
        class="bridge-team-form"
        novalidate
        onsubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div class="bridge-team-form-group">
          <label for="bridge-profile-email-new">{t('profile.email.new')}</label>
          <input id="bridge-profile-email-new" type="email" autocomplete="email" bind:value={next} disabled={busy} data-bridge-profile-email-new />
        </div>
        <div class="bridge-team-form-actions bridge-profile-actions">
          <button type="submit" class="bridge-btn bridge-btn-primary" data-bridge-profile-email-send disabled={busy || next.trim() === ''}>
            {#if busy}<Spinner size={16} />{/if} {t('profile.email.send')}
          </button>
          <button
            type="button"
            class="bridge-btn bridge-btn-secondary"
            data-bridge-profile-email-cancel
            onclick={() => {
              editing = false;
              next = '';
              failure = null;
            }}
            disabled={busy}>{t('profile.email.cancel')}</button
          >
        </div>
      </form>
    {:else}
      <div class="bridge-team-form-actions">
        <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-profile-email-change onclick={() => (editing = true)}>
          {t('profile.email.change')}
        </button>
      </div>
    {/if}
  {/if}
</section>
