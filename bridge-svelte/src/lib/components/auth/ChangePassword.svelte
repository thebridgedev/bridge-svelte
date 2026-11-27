<!--
  Changing the signed-in person's password: the current one, the new one against the app's checklist, and Bridge's
  answer: a wrong current password, a password used recently ("You've used this password recently"), or done. The
  person's other devices are signed out; this one stays signed in.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { isBridgeError, type PasswordRules } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { checklistMet, checklistOf } from '../../core/password-rules.js';
  import { withRecheck } from '../../core/recheck.js';
  import { session } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import PasswordChecklist from '../shared/PasswordChecklist.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading above the form. @default "Change password"; `null` for none */
    heading?: string | null;
    onChange?: () => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { heading = undefined, onChange, onError, messages, class: className, ...rest }: Props = $props();
  const t = $derived(translator(messages));

  let current = $state('');
  let password = $state('');
  let rules = $state<PasswordRules | null>(null);
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let done = $state(false);
  const email = $derived($session.status === 'signed-in' ? $session.user.email : null);
  const minLength = $derived(rules?.minLength ?? 8);

  onMount(() => {
    getBridge()
      .signIn.options()
      .then((found) => (rules = found.password ?? null))
      .catch(() => undefined);
  });

  /** A refused change, in the person's words. */
  function changeError(error: unknown): string {
    if (isBridgeError(error) && error.code === 'wrong_password') return t('password.wrongCurrent');
    if (isBridgeError(error) && error.code === 'password_rules' && error.failed?.includes('history')) return t('password.history');
    return errorMessage(error, t, 'error.generic');
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading) return;
    failure = null;
    done = false;
    if (!checklistMet(checklistOf(rules, password, email))) {
      failure = [...password.normalize('NFKC')].length < minLength ? t('password.tooShort', { count: minLength }) : t('rules.heading');
      return;
    }
    loading = true;
    try {
      await withRecheck(() => getBridge().password.change({ current, password }));
      current = '';
      password = '';
      done = true;
      onChange?.();
    } catch (error) {
      if (!isBridgeError(error, 'cancelled')) failure = changeError(error);
      onError?.(error);
    } finally {
      loading = false;
    }
  }
</script>

<div class="bridge-change-password {className ?? ''}" data-bridge-change-password {...rest}>
  {#if heading !== null}<h3>{heading ?? t('password.changeHeading')}</h3>{/if}
  {#if done}<Alert variant="success" data-bridge-password-changed>{t('password.changed')}</Alert>{/if}
  {#if failure}<Alert variant="error" data-bridge-password-change-error>{failure}</Alert>{/if}
  <form onsubmit={submit}>
    <div class="bridge-form-group">
      <label for="change-password-current">{t('field.currentPassword')}</label>
      <PasswordInput id="change-password-current" autocomplete="current-password" required bind:value={current} disabled={loading} showLabel={t('action.showPassword')} hideLabel={t('action.hidePassword')} />
    </div>
    <div class="bridge-form-group">
      <label for="change-password-new">{t('field.newPassword')}</label>
      <PasswordInput id="change-password-new" autocomplete="new-password" required bind:value={password} disabled={loading} aria-describedby="change-password-rules" showLabel={t('action.showPassword')} hideLabel={t('action.hidePassword')} />
      <PasswordChecklist id="change-password-rules" {rules} {password} {email} {t} />
    </div>
    <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !current || !password}>
      {#if loading}<Spinner size={16} />{/if} {t('password.changeSubmit')}
    </button>
  </form>
</div>
