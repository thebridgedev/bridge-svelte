<!--
  The code screen of an email code (sign-in, sign-up, forgot password): the address the code went to, partly hidden,
  the six-digit field, "Send a new code" after its 60-second wait, and "Wrong email?" back to the form. A wrong code
  says how many tries are left; an expired one asks for a new code. Bridge answers the same whether or not the address
  has an account, so this screen never says which.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy, onMount } from 'svelte';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import { codeErrorMessage, codeSpent } from '../../core/code-errors.js';
  import { countdown } from '../../core/code-input.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import CodeInput from '../shared/CodeInput.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The address the code went to, partly hidden, as Bridge gives it. */
    email: string;
    /** Seconds until a new code may be asked for. @default 60 */
    resendIn?: number;
    heading?: string | null;
    /** Goes on with the code; a refusal it throws is shown here. */
    verify: (code: string) => Promise<void>;
    /** Asks for a new code; answers the seconds until the next one may be asked for. */
    resend: () => Promise<number>;
    /** "Wrong email?": back to the form. */
    onBack: () => void;
    messages?: BridgeMessages;
  }

  let { email, resendIn = 60, heading = undefined, verify, resend, onBack, messages, class: className, style, ...rest }: Props = $props();
  const t = $derived(translator(messages));

  let code = $state('');
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let spent = $state(false);
  let notice = $state<string | null>(null);
  let waitUntil = $state(0);
  let now = $state(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  const left = $derived(Math.max(0, Math.ceil((waitUntil - now) / 1000)));

  onMount(() => {
    waitUntil = Date.now() + resendIn * 1000;
    timer = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => {
    if (timer !== null) clearInterval(timer);
  });

  async function submit(event?: Event) {
    event?.preventDefault();
    if (loading || code.length !== 6 || spent) return;
    failure = null;
    notice = null;
    loading = true;
    try {
      await verify(code);
    } catch (error) {
      failure = codeErrorMessage(error, t);
      spent = codeSpent(error);
      code = '';
    } finally {
      loading = false;
    }
  }

  async function again() {
    if (loading || left > 0) return;
    failure = null;
    loading = true;
    try {
      const wait = await resend();
      waitUntil = Date.now() + wait * 1000;
      now = Date.now();
      spent = false;
      code = '';
      notice = t('code.resent');
    } catch (error) {
      failure = codeErrorMessage(error, t);
    } finally {
      loading = false;
    }
  }
</script>

<AuthFormWrapper heading={heading === undefined ? t('code.heading') : heading} class={className} {style} data-bridge-code-screen {...rest}>
  <p class="bridge-step-desc" data-bridge-code-sent-to>{t('code.sentTo', { email })}</p>
  {#if notice}<Alert variant="info">{notice}</Alert>{/if}
  {#if failure}<Alert variant="error" id="bridge-code-error" data-bridge-code-error>{failure}</Alert>{/if}
  <form onsubmit={submit}>
    <CodeInput id="bridge-email-code" label={t('field.emailCode')} bind:value={code} disabled={loading || spent} invalid={failure !== null} describedBy={failure ? 'bridge-code-error' : undefined} onComplete={() => void submit()} />
    <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || spent || code.length !== 6}>
      {#if loading}<Spinner size={16} />{/if} {t('code.verify')}
    </button>
  </form>
  <div class="bridge-forgot-row">
    <button type="button" class="bridge-link" data-bridge-code-resend onclick={again} disabled={loading || left > 0}>
      {left > 0 ? t('code.resendIn', { time: countdown(left) }) : t('code.resend')}
    </button>
  </div>
  <div class="bridge-form-footer">
    <button type="button" class="bridge-link" data-bridge-code-back onclick={onBack} disabled={loading}>{t('code.wrongEmail')}</button>
  </div>
</AuthFormWrapper>
