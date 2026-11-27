<!--
  The invisible bot check (Cloudflare Turnstile) on a sign-up form of one's
  own, shown only when the app's sign-in options ask for it (sign-up
  protection on Block). People pass without doing anything; Cloudflare shows
  a box only when it must ask. Its answer goes with the sign-up, and Bridge
  checks it on its servers. Social and company sign-in never get it.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { loadTurnstile, type BotAnswer, type TurnstileApi } from '../../core/login-security.js';

  interface Props {
    siteKey: string;
    /** Where the answer goes; the form takes it when it sends the sign-up. */
    answer: BotAnswer;
    /** Changed after each sign-up that was sent: an answer works once, so a new one is made. */
    round?: number;
    /** The widget's language, such as `sv`. @default the browser's */
    language?: string;
  }

  let { siteKey, answer, round = 0, language = undefined }: Props = $props();

  let container: HTMLDivElement;
  let api: TurnstileApi | null = null;
  let widget: string | undefined;
  let gone = false;

  onMount(() => {
    loadTurnstile()
      .then((found) => {
        if (gone) return;
        api = found;
        widget = found.render(container, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          ...(language === undefined ? {} : { language }),
          callback: (token: string) => answer.set(token),
          'expired-callback': () => {
            answer.clear();
            found.reset(widget);
          },
          'error-callback': () => answer.clear(),
        });
      })
      .catch(() => undefined);
  });

  let seen = 0;
  $effect(() => {
    if (round === seen) return;
    seen = round;
    answer.clear();
    if (api !== null && widget !== undefined) api.reset(widget);
  });

  onDestroy(() => {
    gone = true;
    if (api !== null && widget !== undefined) api.remove(widget);
  });
</script>

<div bind:this={container} data-bridge-bot-check></div>
