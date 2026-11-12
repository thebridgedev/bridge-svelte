<!--
  Wrap the root layout's content in it:

    <BridgeBootstrap>{@render children()}</BridgeBootstrap>

  It runs the route guard again when the session or the flags change (a
  sign-out in another tab, a workspace switch, a flag turned off), and
  renders the upgrade dialog a plan limit opens.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';
  import { afterNavigate, invalidate } from '$app/navigation';
  import { navigating } from '$app/state';
  import { bridgeClient, bridgeConfig } from '../core/client.js';
  import { closeUpgrade, upgradeRequest } from '../core/upgrade.js';
  import { canManageBilling } from '../core/flags.js';
  import { FLAGS_DEPENDENCY, SESSION_DEPENDENCY } from '../bootstrap.js';
  import UpgradeDialog from './billing/UpgradeDialog.svelte';

  let { children }: { children?: Snippet } = $props();

  const mayUpgrade = canManageBilling();
  const Dialog = $derived(typeof $bridgeConfig?.upgradeDialog === 'function' ? $bridgeConfig.upgradeDialog : UpgradeDialog);
  const dialogOn = $derived($bridgeConfig?.upgradeDialog !== false);
  const upgradeHref = $derived($bridgeConfig?.paywall ?? `${$bridgeConfig?.billingBase ?? '/subscription'}/plan`);

  // An invalidation is a navigation to the current address, and a later navigation replaces one under way: a sign-in's
  // own `goto` would be lost to the flag results that arrive just after it. So the guard waits for a navigation to end.
  const waiting = new Set<string>();
  function guardAgain(dependency: string) {
    if (navigating.to !== null) waiting.add(dependency);
    else void invalidate(dependency);
  }
  afterNavigate(() => {
    const due = [...waiting];
    waiting.clear();
    for (const dependency of due) void invalidate(dependency);
  });

  let stops: (() => void)[] = [];
  let flagTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const client = $bridgeClient;
    for (const stop of stops) stop();
    stops = [];
    if (client === null) return;
    const again = () => guardAgain(SESSION_DEPENDENCY);
    stops.push(client.on('signed-in', again), client.on('signed-out', again), client.on('workspace-changed', again));
    // Flag results change in bursts (a reload after a notice); guard once they settle.
    let first = true;
    stops.push(
      client.flags.subscribe(() => {
        if (first) {
          first = false;
          return;
        }
        if (flagTimer !== null) clearTimeout(flagTimer);
        flagTimer = setTimeout(() => guardAgain(FLAGS_DEPENDENCY), 150);
      }),
    );
  });

  onDestroy(() => {
    for (const stop of stops) stop();
    if (flagTimer !== null) clearTimeout(flagTimer);
  });
</script>

{@render children?.()}

{#if dialogOn && $upgradeRequest}
  <Dialog request={$upgradeRequest} {upgradeHref} canUpgrade={$mayUpgrade} onclose={closeUpgrade} />
{/if}
