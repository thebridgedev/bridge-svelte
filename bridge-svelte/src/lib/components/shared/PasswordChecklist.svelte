<!--
  The app's password rules as a checklist, shown before anyone types and ticked as they type (`checklistOf`). Bridge
  checks every rule again when the password is saved; "not a common password" and "not the app's name" are checked
  only there, so they show without a tick.
-->
<script lang="ts">
  import type { PasswordRules } from '@nebulr-group/bridge-auth-core';
  import type { BridgeTranslator } from '../../core/i18n.js';
  import { checklistOf } from '../../core/password-rules.js';

  interface Props {
    rules: PasswordRules | null | undefined;
    password: string;
    /** The address the password is for, when the page knows it: the "not your email address" line is ticked then. */
    email?: string | null;
    t: BridgeTranslator;
    id?: string;
  }

  let { rules, password, email = null, t, id = undefined }: Props = $props();
  const items = $derived(checklistOf(rules, password, email));
</script>

<div class="bridge-password-rules" data-bridge-password-rules {id}>
  <p class="bridge-password-rules-heading">{t('rules.heading')}</p>
  <ul>
    {#each items as item (item.rule)}
      <li data-bridge-rule={item.rule} data-met={item.met === null ? 'server' : String(item.met)}>
        <span aria-hidden="true">{item.met === true ? '✓' : item.met === null ? '•' : '○'}</span>
        {t(item.key, item.vars)}
      </li>
    {/each}
  </ul>
</div>

<style>
  @layer bridge {
    .bridge-password-rules {
      margin: 0.25rem 0 0.75rem;
      font-size: 0.8125rem;
      color: var(--bridge-muted, #555);
    }
    .bridge-password-rules-heading {
      margin: 0 0 0.25rem;
    }
    .bridge-password-rules ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .bridge-password-rules li[data-met='true'] {
      color: var(--bridge-success, #15803d);
    }
  }
</style>
