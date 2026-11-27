<!--
  The text-message second step, for a workspace that requires it: the code
  sent to the person's phone, a new code, the backup code when the phone is
  lost; or, the first time, the mobile number to set up. After setup the
  backup code is shown once, and the step that follows goes to `onStep` when
  the person has saved it. Every sign-in form shows it the same way.
-->
<script lang="ts">
  import type { SignInStep } from '@nebulr-group/bridge-auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PhoneInput from '../shared/PhoneInput.svelte';

  type Waiting = Extract<SignInStep, { next: 'second_step' } | { next: 'second_step_setup' }>;

  interface Props extends HTMLAttributes<HTMLDivElement> {
    step: Waiting;
    /** The next step: done, the code again, or the setup. */
    onStep: (next: SignInStep) => void;
    messages?: BridgeMessages;
  }

  let { step, onStep, messages, class: className, style, ...rest }: Props = $props();
  /** Shown once after setup, with the step that follows once the person saved it. */
  let backup = $state<{ code: string; then: SignInStep } | null>(null);
  const t = $derived(translator(messages));
  let value = $state('');
  let backupInput = $state('');
  let usingBackup = $state(false);
  /** True while the phone field holds a number that cannot exist for its country. */
  let phoneInvalid = $state(false);
  let loading = $state(false);
  let failure = $state<string | null>(null);

  async function run(action: () => Promise<SignInStep>) {
    if (loading) return;
    failure = null;
    loading = true;
    try {
      const next = await action();
      value = '';
      backupInput = '';
      usingBackup = false;
      if (next.done && next.backupCode !== undefined) backup = { code: next.backupCode, then: next };
      else onStep(next);
    } catch (error) {
      failure = errorMessage(error, t, 'error.generic');
    } finally {
      loading = false;
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (step.next === 'second_step_setup') {
      // A number that cannot exist for the chosen country is caught here, before any code is sent.
      if (phoneInvalid) {
        failure = t('phone.invalid');
        return;
      }
      void run(() => (step as Extract<Waiting, { next: 'second_step_setup' }>).setUp(value.trim()));
    } else if (usingBackup) void run(() => (step as Extract<Waiting, { next: 'second_step' }>).reset(backupInput.trim()));
    else void run(() => (step as Extract<Waiting, { next: 'second_step' }>).verify(value.trim()));
  }
</script>

{#if backup}
  <AuthFormWrapper heading={t('secondStep.backupHeading')} class={className} {style} data-bridge-sign-in-step="backup-code" {...rest}>
    <p class="bridge-step-desc">{t('secondStep.backupIntro')}</p>
    <div class="bridge-backup-code" data-bridge-backup-code>{backup.code}</div>
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={() => backup && onStep(backup.then)}>{t('secondStep.continue')}</button>
  </AuthFormWrapper>
{:else}
<AuthFormWrapper heading={step.next === 'second_step_setup' ? t('secondStep.setupHeading') : t('secondStep.heading')} class={className} {style} data-bridge-sign-in-step="second-step" data-bridge-second-step={step.next} {...rest}>
  {#if failure}<Alert variant="error">{failure}</Alert>{/if}
  {#if step.next === 'second_step_setup'}
    <p class="bridge-step-desc">{t('secondStep.setupIntro')}</p>
    <form onsubmit={submit}>
      <div class="bridge-form-group">
        <label for="second-step-phone">{t('field.phone')}</label>
        <PhoneInput id="second-step-phone" bind:value bind:invalid={phoneInvalid} disabled={loading} {messages} />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !value.trim()}>
        {#if loading}<Spinner size={16} />{/if} {t('secondStep.sendCode')}
      </button>
    </form>
  {:else if usingBackup}
    <form onsubmit={submit}>
      <div class="bridge-form-group">
        <label for="second-step-backup">{t('field.backupCode')}</label>
        <input id="second-step-backup" type="text" autocomplete="off" required bind:value={backupInput} disabled={loading} />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !backupInput.trim()}>
        {#if loading}<Spinner size={16} />{/if} {t('secondStep.continue')}
      </button>
    </form>
  {:else}
    {#if step.sent}
      <p class="bridge-step-desc">{t('secondStep.codeSent', { phone: step.phone })}</p>
    {:else}
      <Alert variant="error">{t('secondStep.notSent')}</Alert>
    {/if}
    <form onsubmit={submit}>
      <div class="bridge-form-group">
        <label for="second-step-code">{t('field.code')}</label>
        <input id="second-step-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required bind:value disabled={loading} />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !value.trim()}>
        {#if loading}<Spinner size={16} />{/if} {t('secondStep.verify')}
      </button>
    </form>
    <div class="bridge-forgot-row">
      <button type="button" class="bridge-link" data-bridge-second-step-resend onclick={() => run(() => (step as Extract<Waiting, { next: 'second_step' }>).resend())} disabled={loading}>{t('secondStep.resend')}</button>
    </div>
    <div class="bridge-forgot-row">
      <button type="button" class="bridge-link" data-bridge-second-step-backup onclick={() => (usingBackup = true)} disabled={loading}>{t('secondStep.useBackup')}</button>
    </div>
  {/if}
</AuthFormWrapper>
{/if}
