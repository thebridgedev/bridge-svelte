<!--
  A phone number field with a country picker: the country's flag and calling code next to the number. Clicking the
  flag opens every country with a search box (by name, English name, country code or calling code such as "+44").

  - The country to start on is guessed from the browser's language and region settings only. No location is ever
    asked for or looked up; with no region in the settings, no country is shown until the person picks one.
  - The number is typed the way the person is used to, with or without a leading 0. `value` is the full international
    number (`+46701234567`); pasting a number that starts with "+" switches the flag by itself.
  - A number that cannot exist for the chosen country is flagged (`invalid`) so the form can stop before any code is
    sent. An empty field is not invalid.
  - Flags are images (SVG), so they show on every system, Windows included. They load only when the picker is used.

  Enter in the search box chooses the first match and never submits the form around it.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import { browserLanguages, countryRows, displayPhone, filterCountries, guessCountry, readPhone, typing, type Country, type CountryRow } from '../../core/phone.js';

  interface Props {
    id?: string;
    /** The full international number, or the text as typed while it is not one yet. */
    value?: string;
    /** True while the field holds a number that cannot exist for the chosen country. */
    invalid?: boolean;
    disabled?: boolean;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    /** The country to start on, instead of the browser's own settings. */
    defaultCountry?: Country | null;
    messages?: BridgeMessages;
  }

  let { id = 'bridge-phone', value = $bindable(''), invalid = $bindable(false), disabled = false, autocomplete = 'tel-national', defaultCountry = undefined, messages }: Props = $props();

  const t = $derived(translator(messages));
  const locale = typeof navigator === 'undefined' ? 'en' : (browserLanguages()[0] ?? 'en');

  /** The country to start on: the app's choice, else the browser's language and region, else none. */
  const startCountry = (): Country | null => (defaultCountry === undefined ? guessCountry(browserLanguages()) : defaultCountry);
  const initial = displayPhone(value, startCountry());
  let country = $state<Country | null>(initial.country);
  let text = $state(initial.text);
  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let touched = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let searchBox: HTMLInputElement | undefined = $state();
  let flags = $state<Readonly<Record<string, string>> | null>(null);
  let emitted = value;

  const rows: CountryRow[] = countryRows(locale);
  const shown = $derived(filterCountries(rows, query));
  const dial = $derived(country === null ? '' : (rows.find((row) => row.code === country)?.dial ?? ''));
  const currentName = $derived(country === null ? t('phone.country') : (rows.find((row) => row.code === country)?.name ?? country));

  /** The flag as an image the page can show: the SVG text as a data address. */
  function flagSrc(code: string | null): string | null {
    const svg = code === null ? undefined : flags?.[code];
    return svg === undefined ? null : `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /** Loads the flags once, when something first needs to show one. */
  async function loadFlags() {
    if (flags !== null) return;
    try {
      flags = (await import('country-flag-icons/string/3x2')) as unknown as Record<string, string>;
    } catch {
      // Without flags the picker still works, by calling code and name.
    }
  }

  onMount(() => void loadFlags());

  function emit() {
    const reading = readPhone(text, country);
    emitted = reading.value;
    value = reading.value;
    invalid = !reading.empty && !reading.possible;
    if (reading.country !== country) country = reading.country;
  }

  // A value set from outside (a profile that finished loading) replaces what is shown, unless it is what was just typed.
  $effect(() => {
    const incoming = value;
    if (incoming === emitted) return;
    emitted = incoming;
    const shownNow = displayPhone(incoming, country ?? startCountry());
    country = shownNow.country ?? country;
    text = shownNow.text;
    invalid = false;
  });

  function onInput(event: Event & { currentTarget: HTMLInputElement }) {
    touched = true;
    const raw = event.currentTarget.value;
    // A "+" number names its own country: the flag follows as it is typed or pasted.
    text = raw.trim().startsWith('+') || country !== null ? typing(raw, raw.trim().startsWith('+') ? null : country) : raw;
    emit();
  }

  function onBlur() {
    touched = true;
    const shownNow = displayPhone(value, country);
    if (value.startsWith('+') && !invalid && shownNow.text !== '') text = shownNow.text;
  }

  async function toggle() {
    if (disabled) return;
    open = !open;
    if (open) {
      query = '';
      active = Math.max(0, shown.findIndex((row) => row.code === country));
      void loadFlags();
      await tick();
      searchBox?.focus();
    }
  }

  function choose(row: CountryRow) {
    country = row.code;
    open = false;
    // The same digits, read for the new country.
    emit();
    root?.querySelector<HTMLInputElement>('input[type="tel"]')?.focus();
  }

  function onSearchKey(event: KeyboardEvent) {
    // Nothing in the list submits the form around the field.
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = shown[active] ?? shown[0];
      if (row !== undefined) choose(row);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(shown.length - 1, active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, active - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      open = false;
    }
  }

  function outside(event: MouseEvent) {
    if (open && root !== undefined && !root.contains(event.target as Node)) open = false;
  }

  $effect(() => {
    // Keep the highlighted country in view.
    if (open && active >= 0) root?.querySelector(`[data-bridge-phone-option="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  });
</script>

<svelte:window onclick={outside} />

<div class="bridge-phone" bind:this={root} data-bridge-phone data-invalid={invalid && touched ? 'true' : undefined}>
  <div class="bridge-phone-field">
    <button
      type="button"
      class="bridge-phone-country"
      data-bridge-phone-country={country ?? ''}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label="{t('phone.country')}: {currentName}"
      {disabled}
      onclick={toggle}
    >
      {#if flagSrc(country)}<img class="bridge-phone-flag" src={flagSrc(country)} alt="" width="20" height="14" />{:else}<span class="bridge-phone-flag bridge-phone-flag-none" aria-hidden="true"></span>{/if}
      <span class="bridge-phone-dial">{dial === '' ? '' : `+${dial}`}</span>
    </button>
    <input {id} type="tel" inputmode="tel" {autocomplete} value={text} {disabled} oninput={onInput} onblur={onBlur} aria-invalid={invalid && touched ? 'true' : undefined} />
  </div>
  {#if open}
    <div class="bridge-phone-picker" data-bridge-phone-picker>
      <input
        bind:this={searchBox}
        type="search"
        class="bridge-phone-search"
        data-bridge-phone-search
        placeholder={t('phone.search')}
        aria-label={t('phone.search')}
        autocomplete="off"
        bind:value={query}
        oninput={() => (active = 0)}
        onkeydown={onSearchKey}
      />
      <ul class="bridge-phone-list" role="listbox" aria-label={t('phone.country')}>
        {#each shown as row, index (row.code)}
          <li role="option" aria-selected={row.code === country} data-active={index === active ? 'true' : undefined} data-bridge-phone-option={index}>
            <button type="button" tabindex="-1" onclick={() => choose(row)}>
              {#if flagSrc(row.code)}<img class="bridge-phone-flag" src={flagSrc(row.code)} alt="" width="20" height="14" loading="lazy" />{:else}<span class="bridge-phone-flag bridge-phone-flag-none" aria-hidden="true"></span>{/if}
              <span class="bridge-phone-name">{row.name}</span>
              <span class="bridge-phone-dial">+{row.dial}</span>
            </button>
          </li>
        {:else}
          <li class="bridge-phone-empty">{t('phone.noResults')}</li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if invalid && touched}<p class="bridge-phone-error" role="alert" data-bridge-phone-error>{t('phone.invalid')}</p>{/if}
</div>
