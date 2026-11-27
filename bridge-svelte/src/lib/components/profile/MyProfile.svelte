<!--
  My profile: a ready-made page where a signed-in person sees and changes
  their own details and security.

    <MyProfile />

  Details: their names (unless the app collects none: `names={false}`), the
  app's own fields that Bridge sends with the profile, and their own language,
  one of the 12 screen languages. A saved change shows at once: the page
  switches to the chosen language, and `<ProfileName>` and every `me` reader
  see the new values.

  Email: the address they sign in with and "Change email" (`<EmailSettings>`),
  or "Managed by Google" for an address a provider manages.

  Security settings: the password and passkeys (`<SecuritySettings>`); `securityExtra`
  adds more below them.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { untrack } from 'svelte';
  import type { Me, UserLanguage } from '@nebulr-group/bridge-auth-core';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, setUserLocale, translator } from '../../core/i18n.js';
  import { detailsChange, formOf, isProfileLanguage, PROFILE_LANGUAGES, saveDetails, shownFields, type DetailsForm } from '../../core/profile.js';
  import { me } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import EmailSettings from './EmailSettings.svelte';
  import SecuritySettings from './SecuritySettings.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The page's heading. @default "My profile"; `null` for none */
    heading?: string | null;
    /** Whether the app collects names: false shows no name fields. @default true */
    names?: boolean;
    /** Whether the profile shows the phone number. @default false */
    phone?: boolean;
    /** Whether to show the Security settings. @default true */
    showSecurity?: boolean;
    /** More security settings, below the password and passkeys. */
    securityExtra?: Snippet;
    /** Called after the details were saved. */
    onSave?: (profile: Omit<Me, 'workspaces'>) => void;
    /** Called when the person chose another language and it was saved: switch the app's own language too, if it has one. */
    onLanguageChange?: (language: UserLanguage | null) => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let {
    heading = undefined,
    names = true,
    phone = false,
    showSecurity = true,
    securityExtra,
    onSave,
    onLanguageChange,
    onError,
    messages,
    class: className,
    ...rest
  }: Props = $props();

  // The person's own language, once saved: this page shows in it at once.
  let language = $state<string | null>(null);
  const t = $derived(translator(messages, language));

  let base = $state<Me | null>(null);
  let form = $state<DetailsForm>({ firstName: '', lastName: '', phoneNumber: '', language: '', fields: {} });
  let saving = $state(false);
  let failure = $state<string | null>(null);
  let saved = $state(false);

  const fields = $derived(base === null ? [] : shownFields(base));
  const change = $derived(base === null ? {} : detailsChange(base, form, { names, phone }));
  const dirty = $derived(Object.keys(change).length > 0);

  function adopt(value: Me) {
    base = value;
    form = formOf(value);
    if (isProfileLanguage(value.language)) {
      language = value.language;
      setUserLocale(value.language);
    }
  }

  // What is loaded already fills the form before the first paint.
  untrack(() => {
    const loaded = $me.value;
    if (loaded !== null) adopt(loaded);
  });

  // Fresh values from Bridge fill the form, unless the person is mid-edit.
  $effect(() => {
    const value = $me.value;
    if (value !== null) untrack(() => !dirty && !saving && adopt(value));
  });

  async function save() {
    if (!dirty || saving) return;
    saving = true;
    failure = null;
    saved = false;
    const sent = change;
    try {
      const profile = await saveDetails(sent);
      if (base !== null) adopt({ ...base, ...profile, workspaces: base.workspaces });
      if ('language' in sent) {
        const chosen = isProfileLanguage(sent.language) ? sent.language : null;
        language = chosen;
        setUserLocale(chosen);
        onLanguageChange?.(chosen);
      }
      saved = true;
      onSave?.(profile);
      // `<ProfileName>` and every other reader of `me` see it at once.
      await me.refresh();
    } catch (error) {
      failure = errorMessage(error, t);
      onError?.(error);
    } finally {
      saving = false;
    }
  }
</script>

<div class="bridge-my-profile {className ?? ''}" data-bridge-my-profile lang={language ?? undefined} {...rest}>
  {#if heading !== null}<h3 class="bridge-team-section-title">{heading ?? t('profile.heading')}</h3>{/if}

  {#if base === null}
    {#if $me.error}
      <Alert variant="error">{errorMessage($me.error, t)}</Alert>
    {:else}
      <div class="bridge-team-loading" data-bridge-my-profile-loading>
        <Spinner size={24} />
        <span>{t('profile.loading')}</span>
      </div>
    {/if}
  {:else}
    <section class="bridge-profile-section" data-bridge-profile-details>
      <h4 class="bridge-profile-section-title">{t('profile.details')}</h4>
      {#if failure}<Alert variant="error" data-bridge-profile-details-error>{failure}</Alert>{/if}
      {#if saved && !dirty}<Alert variant="success" data-bridge-profile-saved>{t('profile.saved')}</Alert>{/if}
      <form
        class="bridge-team-form"
        onsubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {#if names}
          <div class="bridge-team-form-row">
            <div class="bridge-team-form-group">
              <label for="bridge-profile-first-name">{t('field.firstName')}</label>
              <input id="bridge-profile-first-name" type="text" autocomplete="given-name" bind:value={form.firstName} disabled={saving} />
            </div>
            <div class="bridge-team-form-group">
              <label for="bridge-profile-last-name">{t('field.lastName')}</label>
              <input id="bridge-profile-last-name" type="text" autocomplete="family-name" bind:value={form.lastName} disabled={saving} />
            </div>
          </div>
        {/if}
        {#if phone}
          <div class="bridge-team-form-group">
            <label for="bridge-profile-phone">{t('field.phoneNumber')}</label>
            <input id="bridge-profile-phone" type="tel" autocomplete="tel" bind:value={form.phoneNumber} disabled={saving} />
          </div>
        {/if}
        {#each fields as field (field.label)}
          {@const id = `bridge-profile-field-${field.label.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
          <div class="bridge-team-form-group" data-bridge-profile-field={field.label}>
            <label for={id}>{field.userLabel ?? field.label}</label>
            {#if field.editable === false}
              <input {id} type="text" value={field.value ?? ''} readonly />
            {:else if field.type === 'boolean'}
              <select {id} bind:value={form.fields[field.label]} disabled={saving}>
                <option value=""></option>
                <option value="true">✓</option>
                <option value="false">✗</option>
              </select>
            {:else}
              <input
                {id}
                type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                pattern={field.type === 'regex' ? field.regex : undefined}
                bind:value={form.fields[field.label]}
                disabled={saving}
              />
            {/if}
          </div>
        {/each}
        <div class="bridge-team-form-group">
          <label for="bridge-profile-language">{t('profile.language')}</label>
          <select id="bridge-profile-language" bind:value={form.language} disabled={saving} data-bridge-profile-language>
            <option value="">{t('profile.languageNone')}</option>
            {#each PROFILE_LANGUAGES as each (each.code)}
              <option value={each.code} lang={each.code}>{each.name}</option>
            {/each}
          </select>
        </div>
        <div class="bridge-team-form-actions">
          <button type="submit" class="bridge-btn bridge-btn-primary" data-bridge-profile-save disabled={saving || !dirty}>
            {saving ? t('profile.saving') : t('profile.save')}
          </button>
        </div>
      </form>
    </section>

    <EmailSettings email={base.email} locale={language} {messages} {onError} onChange={() => void me.refresh()} />

    {#if showSecurity}
      <SecuritySettings email={base.email} locale={language} extra={securityExtra} {messages} {onError} />
    {/if}
  {/if}
</div>
