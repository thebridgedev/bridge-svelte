<!--
  A six-digit code field: one input, drawn as six boxes. It takes digits only (`inputmode="numeric"`), offers the
  code from a text message or email in the keyboard's suggestions (`autocomplete="one-time-code"`), and keeps the digits
  of a pasted code ("123 456", "Your code: 123456"). Screen readers hear one field with its label. `onComplete` runs
  once all six digits are in.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { codeDigits } from '../../core/code-input.js';

  interface Props extends Omit<HTMLInputAttributes, 'value' | 'type'> {
    value: string;
    /** The field's label, read by screen readers and shown above the boxes. */
    label: string;
    id?: string;
    length?: number;
    disabled?: boolean;
    /** Marks the field as refused (a wrong code): `aria-invalid`. */
    invalid?: boolean;
    /** The id of the message that explains the field, such as the error. */
    describedBy?: string;
    onComplete?: (code: string) => void;
  }

  let { value = $bindable(''), label, id = 'bridge-code', length = 6, disabled = false, invalid = false, describedBy = undefined, onComplete, class: className, ...rest }: Props = $props();

  function take(next: string) {
    const digits = codeDigits(next, length);
    const was = value;
    value = digits;
    if (digits.length === length && digits !== was) onComplete?.(digits);
  }
</script>

<div class="bridge-form-group bridge-code-field {className ?? ''}" data-bridge-code-input>
  <label for={id}>{label}</label>
  <div class="bridge-code-boxes" style="--bridge-code-length: {length}">
    <input
      {id}
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="one-time-code"
      maxlength={length}
      spellcheck="false"
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={describedBy}
      {disabled}
      {value}
      oninput={(event) => take(event.currentTarget.value)}
      onpaste={(event) => {
        const pasted = event.clipboardData?.getData('text') ?? '';
        if (pasted === '') return;
        event.preventDefault();
        take(pasted);
      }}
      {...rest}
    />
    <div class="bridge-code-slots" aria-hidden="true">
      {#each Array.from({ length }, (_, index) => index) as index (index)}
        <span class="bridge-code-slot" data-filled={index < value.length ? 'true' : undefined} data-active={index === Math.min(value.length, length - 1) ? 'true' : undefined}>{value[index] ?? ''}</span>
      {/each}
    </div>
  </div>
</div>

<style>
  @layer bridge {
    .bridge-code-boxes {
      position: relative;
      width: calc(var(--bridge-code-length) * 2.75rem + (var(--bridge-code-length) - 1) * 0.5rem);
      max-width: 100%;
      height: 3.25rem;
    }
    .bridge-code-boxes input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      font-size: 16px;
      color: transparent;
      caret-color: transparent;
      background: transparent;
      border: 0;
      z-index: 1;
    }
    .bridge-code-slots {
      display: grid;
      grid-template-columns: repeat(var(--bridge-code-length), 1fr);
      gap: 0.5rem;
      height: 100%;
    }
    .bridge-code-slot {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--bridge-border, #d1d5db);
      border-radius: var(--bridge-border-radius, 6px);
      background: var(--bridge-bg, #fff);
      color: var(--bridge-foreground, #111827);
      font-size: 1.375rem;
      font-variant-numeric: tabular-nums;
    }
    .bridge-code-boxes input:focus-visible + .bridge-code-slots .bridge-code-slot[data-active='true'] {
      border-color: var(--bridge-primary, #4f46e5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--bridge-primary, #4f46e5) 30%, transparent);
    }
    .bridge-code-boxes input[aria-invalid='true'] + .bridge-code-slots .bridge-code-slot {
      border-color: var(--bridge-alert-error-border, #fca5a5);
    }
    .bridge-code-boxes input:disabled + .bridge-code-slots .bridge-code-slot {
      opacity: 0.6;
    }
  }
</style>
