<!--
  How strong a new password is: weak, fair or strong. Never "strong" for a
  password the app's rules refuse. The estimator loads the first time a
  password is typed. Bridge checks the password again when it is sent.
-->
<script lang="ts">
  import type { SignInOptions } from '@nebulr-group/bridge-auth-core';
  import type { BridgeTranslator } from '../../core/i18n.js';
  import { loadGuesser, meetsRules, strengthOf, type Guesser } from '../../core/login-security.js';

  interface Props {
    password: string;
    /** The app's password rules, from the sign-in options. */
    rules?: NonNullable<SignInOptions['password']>;
    /** Words the password should not lean on: the person's email and names. */
    userInputs?: readonly string[];
    t: BridgeTranslator;
  }

  let { password, rules = undefined, userInputs = [], t }: Props = $props();

  let guess = $state<Guesser | null>(null);
  $effect(() => {
    if (password !== '' && guess === null) {
      loadGuesser()
        .then((found) => (guess = found))
        .catch(() => undefined);
    }
  });

  const email = $derived(userInputs.find((each) => each.includes('@')) ?? '');
  // Until the estimator is loaded, only what the rules say: a password they refuse is weak.
  const strength = $derived(
    password === '' ? null : guess === null ? (meetsRules(password, rules, email) ? null : 'weak') : strengthOf(password, rules, guess, userInputs),
  );
</script>

{#if strength}
  <div class="bridge-password-strength" data-bridge-password-strength data-strength={strength} aria-live="polite">
    <div class="bridge-password-strength-bar" aria-hidden="true"><span></span></div>
    <span>{t('password.strength.label', { strength: t(`password.strength.${strength}`) })}</span>
  </div>
{/if}
