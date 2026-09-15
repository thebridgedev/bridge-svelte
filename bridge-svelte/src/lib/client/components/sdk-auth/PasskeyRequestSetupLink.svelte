<script lang="ts">
  import { untrack } from 'svelte';
  import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import { authErrorMessage } from './shared/auth-error.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props {
    initialEmail?: string;
    onBack: () => void;
    /**
     * Step description. Pass `null`/`''` to render nothing and use your own
     * subtitle (TBP-631). Applies to whichever view is showing; the two views
     * have different built-in copy, and the 'sent' one carries markup, so a
     * string override replaces both with the same sentence.
     */
    description?: string | null;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let { initialEmail = '', onBack, description = undefined, messages }: Props = $props();

  const t = $derived(getTranslator(messages));

  // The catalogue holds the whole sentence with a `{email}` placeholder so a
  // locale can put the address wherever it belongs; the split below runs on the
  // already-translated string purely to wrap it in `<strong>`.
  const sentDescriptionParts = $derived(t('passkey.sentDescription').split('{email}'));

  type ViewState = 'form' | 'sent';

  let view = $state<ViewState>('form');
  let email = $state('');
  let loading = $state(false);

  // Seed email from prop once (runs at component creation)
  untrack(() => { email = initialEmail; });
  let error = $state<string | null>(null);

  async function handleSubmit() {
    if (loading || !email.trim()) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().requestPasskeySetupLink(email);
      view = 'sent';
    } catch (err: any) {
      error = authErrorMessage(err, t, 'passkey.error.sendLink');
    } finally {
      loading = false;
    }
  }
</script>

{#snippet sentDescription()}
  <p class="bridge-step-desc">{sentDescriptionParts[0]}<strong>{email}</strong>{sentDescriptionParts[1] ?? ''}</p>
{/snippet}

{#if view === 'sent'}
  <AuthFormWrapper
    heading={t('passkey.sentHeading')}
    description={description === undefined ? undefined : description}
    descriptionSnippet={description === undefined ? sentDescription : undefined}
  >
    <button type="button" class="bridge-btn bridge-btn-secondary" onclick={onBack}>
      {t('action.backToLogin')}
    </button>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper
    heading={t('passkey.createHeading')}
    description={description === undefined ? t('passkey.requestDescription') : description}
  >
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="bridge-form-group">
        <label for="passkey-request-email">{t('field.email')}</label>
        <input
          id="passkey-request-email"
          type="email"
          placeholder={t('placeholder.email')}
          required
          bind:value={email}
          disabled={loading}
        />
      </div>
      <button
        type="submit"
        class="bridge-btn bridge-btn-primary"
        disabled={loading || !email.trim()}
      >
        {#if loading}<Spinner size={16} />{:else}{t('passkey.requestSubmit')}{/if}
      </button>
    </form>
    <div class="bridge-form-footer">
      <button type="button" class="bridge-link" onclick={onBack}>
        &larr; {t('action.backToLogin')}
      </button>
    </div>
  </AuthFormWrapper>
{/if}
