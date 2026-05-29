<!--
  Phase 4 (TBP-288/320) — minimal context provider for the bridge surface.

  Wrap your app:
    <BridgeProvider>
      <YourApp />
    </BridgeProvider>

  Without props, it sets the module-level singleton into context. To override
  (SSR, multi-tenant tests, storybook), pass `{ bridge }`.

  Distinct from <BridgeBootstrap>: that one orchestrates the full bootstrap
  side effects (OAuth callback, route guards, billing mount). This is just
  a thin context-setting wrapper. The two are composable — wrap
  <BridgeBootstrap> in a <BridgeProvider> if you need both.
-->
<script lang="ts">
  import { bridge as singleton } from '../core/bridge.js';
  import { setBridgeContext } from '../core/use-bridge.js';
  import type { BridgeSurface } from '../core/bridge.js';

  interface Props {
    bridge?: BridgeSurface;
    children?: import('svelte').Snippet;
  }
  const { bridge = singleton, children }: Props = $props();

  setBridgeContext(bridge);
</script>

{@render children?.()}
