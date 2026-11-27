<!--
  Offers a passkey at the right moment (TBP-536): right after a sign-in another way, before the person goes on into
  the app. Bridge decides whether to (`passkeys.offer()`): never after a passkey or company sign-in, nor to someone who
  has one, nor after "Don't ask again", nor within 30 days of "Not now". Where the browser can, and the sign-in was a
  password, the browser makes one on its own first (automatic creation) and the page only says so. Nothing here ever
  stops the sign-in: whatever fails, the person goes on.

  Used by the sign-in form and the sign-in link page; usable on its own after a sign-in: `<PasskeyOffer onDone={…} />`.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Called once the person goes on: offered and answered, made, or nothing to offer. */
    onDone: () => void;
    messages?: BridgeMessages;
  }

  let { onDone, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  let view = $state<'checking' | 'offer' | 'working' | 'made' | 'saved' | 'failed'>('checking');
  let finished = false;

  function done() {
    if (finished) return;
    finished = true;
    onDone();
  }

  onMount(async () => {
    const passkeys = getBridge().passkeys;
    const offer = await passkeys.offer();
    if (offer.automatic && (await passkeys.addAutomatically()) !== null) {
      view = 'saved';
      return;
    }
    if (offer.offer) view = 'offer';
    else done();
  });

  async function create() {
    view = 'working';
    try {
      await getBridge().passkeys.add();
      view = 'made';
    } catch {
      // A closed dialog, a device that has one, anything: the person goes on, told that none was made.
      view = 'failed';
    }
  }

  async function answer(action: 'later' | 'never') {
    view = 'working';
    try {
      await getBridge().passkeys.answerOffer(action);
    } catch {
      // Not kept: asked again next time, which is no harm.
    }
    done();
  }
</script>

{#if view === 'checking' || view === 'working'}
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-passkey-offer={view} {...rest}>
    <div class="bridge-center"><Spinner size={24} /></div>
  </AuthFormWrapper>
{:else if view === 'offer'}
  <AuthFormWrapper heading={t('passkey.offerHeading')} description={t('passkey.offerText')} class={className} {style} data-bridge-passkey-offer="offer" {...rest}>
    <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-passkey-offer-create onclick={create}>{t('passkey.create')}</button>
    <div class="bridge-form-footer">
      <button type="button" class="bridge-link" data-bridge-passkey-offer-later onclick={() => answer('later')}>{t('passkey.offerLater')}</button>
      <button type="button" class="bridge-link" data-bridge-passkey-offer-never onclick={() => answer('never')}>{t('passkey.offerNever')}</button>
    </div>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-passkey-offer={view} {...rest}>
    <Alert variant={view === 'failed' ? 'info' : 'success'}>{t(view === 'failed' ? 'passkey.offerFailed' : view === 'saved' ? 'passkey.automaticDone' : 'passkey.offerDone')}</Alert>
    <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-passkey-offer-continue onclick={done}>{t('passkey.offerContinue')}</button>
  </AuthFormWrapper>
{/if}
