<!--
  Shows its children when a flag is on, and `fallback` when it is off.

  `fallback` learns why the feature is off: `reason` is `'plan'` when the
  flag's rule needs a plan feature the workspace lacks (with `entitlement`
  naming it), `'off'` otherwise, and `openUpgrade()` opens the upgrade
  dialog. With `upgrade` and no `fallback`, a feature off because of the plan
  shows a small upgrade prompt in its place.

    <FeatureFlag key="reports">
      <Reports />
    </FeatureFlag>

    <FeatureFlag key="reports" upgrade>
      <Reports />
    </FeatureFlag>
-->
<script lang="ts" module>
  export interface FeatureFlagOffInfo {
    /** `plan`: an upgrade would turn it on. `off`: anything else. Undefined while results load. */
    readonly reason: 'plan' | 'off' | undefined;
    /** With `plan`: the plan feature the rule needs. */
    readonly entitlement: string | null;
    /** Bridge's own words for which part of the rule decided, when it says. */
    readonly why: string | null;
    /** Opens the upgrade dialog. Call it from a click. */
    readonly openUpgrade: () => void;
  }
</script>

<script lang="ts" generics="T = boolean">
  import type { Snippet } from 'svelte';
  import { bridgeClient } from '../../core/client.js';
  import { flags, flagsStatus } from '../../core/stores.js';
  import { openUpgrade } from '../../core/upgrade.js';
  import { translator } from '../../core/i18n.js';
  import type { BridgeMessages } from '../../core/config.js';

  interface Props {
    key: string;
    /** The value while Bridge gave none. @default false */
    defaultValue?: T;
    /** Show an upgrade prompt when the plan is why it is off and there is no `fallback`. */
    upgrade?: boolean;
    children?: Snippet<[T]>;
    fallback?: Snippet<[T, FeatureFlagOffInfo]>;
    messages?: BridgeMessages;
  }

  let { key, defaultValue = false as T, upgrade = false, children, fallback, messages }: Props = $props();

  const t = $derived(translator(messages));

  const value = $derived.by(() => {
    void $flags;
    return $bridgeClient === null ? defaultValue : $bridgeClient.flags.get<T>(key, defaultValue);
  });
  const on = $derived(typeof value === 'boolean' ? value : value !== defaultValue && value !== null && value !== undefined);

  const off = $derived.by((): FeatureFlagOffInfo => {
    void $flags;
    const why = $bridgeClient?.flags.reason(key) ?? null;
    const entitlement = why?.entitlement ?? null;
    const loaded = $flagsStatus === 'ready' || $flagsStatus === 'error';
    return {
      reason: !loaded ? undefined : entitlement !== null ? 'plan' : 'off',
      entitlement,
      why: why?.why ?? null,
      openUpgrade: () => openUpgrade({ kind: 'feature', flag: key, entitlement }),
    };
  });
</script>

{#if on}
  {@render children?.(value)}
{:else if fallback}
  {@render fallback(value, off)}
{:else if upgrade && off.reason === 'plan'}
  <button type="button" class="bridge-btn bridge-btn-outline" data-bridge-feature-upgrade={key} onclick={off.openUpgrade}>
    {t('feature.upgrade')}
  </button>
{/if}
