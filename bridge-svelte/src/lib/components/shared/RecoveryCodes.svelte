<!--
  Recovery codes, shown once: each finishes the second step once when the authenticator app or the phone is not at
  hand. Copy, download or print them; "Continue" waits for "I've saved these". Bridge keeps only their hashes, so they
  are never shown again.
-->
<script lang="ts">
  import type { BridgeTranslator } from '../../core/i18n.js';
  import { recoveryCodesText } from '../../core/code-input.js';

  interface Props {
    codes: readonly string[];
    t: BridgeTranslator;
    /** Called once the person ticked "I've saved these" and pressed Continue. */
    onDone: () => void;
    /** The Continue button's text. @default "Continue" */
    doneLabel?: string;
  }

  let { codes, t, onDone, doneLabel = undefined }: Props = $props();
  let saved = $state(false);
  let copied = $state(false);
  const text = $derived(recoveryCodesText(codes, t('recovery.fileHeading')));

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recovery-codes.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function print() {
    const opened = window.open('', '_blank', 'width=480,height=640');
    if (opened === null) return;
    const pre = opened.document.createElement('pre');
    pre.textContent = text;
    pre.style.font = '16px/1.6 monospace';
    opened.document.body.appendChild(pre);
    opened.focus();
    opened.print();
  }
</script>

<div class="bridge-recovery" data-bridge-recovery-codes>
  <p class="bridge-step-desc">{t('recovery.intro')}</p>
  <ul class="bridge-recovery-list" aria-label={t('recovery.heading')}>
    {#each codes as code (code)}<li><code>{code}</code></li>{/each}
  </ul>
  <div class="bridge-recovery-actions">
    <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-recovery-copy onclick={copy}>{copied ? t('recovery.copied') : t('recovery.copy')}</button>
    <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-recovery-download onclick={download}>{t('recovery.download')}</button>
    <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-recovery-print onclick={print}>{t('recovery.print')}</button>
  </div>
  <label class="bridge-check">
    <input type="checkbox" bind:checked={saved} data-bridge-recovery-saved />
    {t('recovery.saved')}
  </label>
  <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-recovery-continue disabled={!saved} onclick={onDone}>{doneLabel ?? t('secondStep.continue')}</button>
</div>

<style>
  @layer bridge {
    .bridge-recovery-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.375rem 1rem;
      list-style: none;
      margin: 0.5rem 0 0.75rem;
      padding: 0.75rem;
      border: 1px solid var(--bridge-border, #d1d5db);
      border-radius: var(--bridge-border-radius, 6px);
      font-size: 0.9375rem;
    }
    .bridge-recovery-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .bridge-recovery-actions .bridge-btn {
      width: auto;
      flex: 1 1 auto;
    }
    .bridge-check {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin: 0.5rem 0 0.75rem;
    }
  }
</style>
