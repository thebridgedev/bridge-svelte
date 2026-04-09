<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getConfig } from '../../stores/config.store.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onSignup?: () => void;
    onError?: (error: Error) => void;
    showLoginLink?: boolean;
    /** Override login page URL. Default: derived from BridgeConfig loginRoute. */
    loginHref?: string | undefined;
    heading?: string;
    footer?: Snippet;
  }

  let {
    onSignup,
    onError,
    showLoginLink = true,
    loginHref = undefined,
    heading = 'Create your account',
    footer,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let effectiveLoginHref = $derived(loginHref ?? getConfig().loginRoute);

  let email = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  async function handleSubmit() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().signup(email, firstName, lastName);
      success = true;
      onSignup?.();
    } catch (err: any) {
      error = err.message || 'Failed to create account.';
      onError?.(err);
    } finally {
      loading = false;
    }
  }
</script>

<AuthFormWrapper {heading} class={className} {style} {...rest}>
  {#if success}
    <h2 class="bridge-success-heading">Check your email</h2>
    <p class="bridge-step-desc">We sent a verification link to <strong>{email}</strong>. Check your inbox to activate your account.</p>
    {#if footer}
      {@render footer()}
    {:else if showLoginLink}
      <div class="bridge-form-footer">
        Already have an account? <a href={effectiveLoginHref}>Log in</a>
      </div>
    {/if}
  {:else}
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="bridge-form-group">
        <label for="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          placeholder="you@example.com"
          required
          bind:value={email}
          disabled={loading}
        />
      </div>
      <div class="bridge-form-group">
        <label for="signup-first-name">First name</label>
        <input
          id="signup-first-name"
          type="text"
          placeholder="First name"
          bind:value={firstName}
          disabled={loading}
        />
      </div>
      <div class="bridge-form-group">
        <label for="signup-last-name">Last name</label>
        <input
          id="signup-last-name"
          type="text"
          placeholder="Last name"
          bind:value={lastName}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim()}>
        {#if loading}<Spinner size={16} />{:else}Sign up{/if}
      </button>
    </form>

    {#if footer}
      {@render footer()}
    {:else if showLoginLink}
      <div class="bridge-form-footer">
        Already have an account? <a href={effectiveLoginHref}>Log in</a>
      </div>
    {/if}
  {/if}
</AuthFormWrapper>
