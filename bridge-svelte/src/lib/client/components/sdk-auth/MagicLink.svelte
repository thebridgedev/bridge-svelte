<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onSent?: () => void;
    onError?: (error: Error) => void;
    loginHref?: string;
  }

  let {
    onSent,
    onError,
    loginHref = '/login',
    class: className,
    style,
    ...rest
  }: Props = $props();

  let email = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let sent = $state(false);
  let expiresIn = $state(0);

  async function handleSend() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      const result = await getBridgeAuth().sendMagicLink(email);
      expiresIn = result.expiresIn;
      sent = true;
      onSent?.();
    } catch (err: any) {
      error = err.message || 'Failed to send magic link.';
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  function formatExpiry(seconds: number): string {
    if (seconds >= 60) {
      return `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) !== 1 ? 's' : ''}`;
    }
    return `${seconds} seconds`;
  }
</script>

<AuthFormWrapper heading="Sign in with email link" class={className} {style} {...rest}>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if sent}
    <Alert variant="success">
      Check your email — link expires in {formatExpiry(expiresIn)}.
    </Alert>
    {#if loginHref}
      <div class="bridge-form-footer">
        <a href={loginHref}>Back to login</a>
      </div>
    {/if}
  {:else}
    <p class="bridge-step-desc">Enter your email and we'll send you a sign-in link. No password needed.</p>
    <form onsubmit={(e) => { e.preventDefault(); handleSend(); }}>
      <div class="bridge-form-group">
        <label for="magic-email">Email</label>
        <input
          id="magic-email"
          type="email"
          placeholder="you@example.com"
          required
          bind:value={email}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim()}>
        {#if loading}<Spinner size={16} />{:else}Send magic link{/if}
      </button>
    </form>
    {#if loginHref}
      <div class="bridge-form-footer">
        <a href={loginHref}>Back to login</a>
      </div>
    {/if}
  {/if}
</AuthFormWrapper>
