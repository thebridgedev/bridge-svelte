<script lang="ts">
  import { untrack } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props {
    initialEmail?: string;
    onBack: () => void;
  }

  let { initialEmail = '', onBack }: Props = $props();

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
      error = err.message || 'Failed to send setup link.';
    } finally {
      loading = false;
    }
  }
</script>

{#if view === 'sent'}
  <AuthFormWrapper heading="Check your email">
    <p class="bridge-step-desc">
      We sent a passkey setup link to <strong>{email}</strong>. Please check your inbox and click the link to create your passkey and finish signing in.
    </p>
    <button type="button" class="bridge-btn bridge-btn-secondary" onclick={onBack}>
      Back to login
    </button>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading="Create a passkey">
    <p class="bridge-step-desc">
      Enter your email and we will send a link to create your passkey.
    </p>
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="bridge-form-group">
        <label for="passkey-request-email">Email</label>
        <input
          id="passkey-request-email"
          type="email"
          placeholder="you@example.com"
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
        {#if loading}<Spinner size={16} />{:else}Send setup link{/if}
      </button>
    </form>
    <div class="bridge-form-footer">
      <button type="button" class="bridge-link" onclick={onBack}>
        &larr; Back to login
      </button>
    </div>
  </AuthFormWrapper>
{/if}
