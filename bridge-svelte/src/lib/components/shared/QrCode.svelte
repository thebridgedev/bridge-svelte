<!--
  A QR code, drawn in the page from `value` (such as an authenticator app's `otpauth://` address): nothing is sent
  anywhere to be drawn. `label` is what a screen reader hears instead; show the typed key beside it too.
-->
<script lang="ts">
  import { encodeQr, qrPath } from '../../core/qr.js';

  interface Props {
    value: string;
    label: string;
    /** The width and height in CSS pixels. @default 192 */
    size?: number;
  }

  let { value, label, size = 192 }: Props = $props();
  const drawn = $derived(qrPath(encodeQr(value, 'M')));
</script>

<svg class="bridge-qr" viewBox={drawn.viewBox} width={size} height={size} role="img" aria-label={label} shape-rendering="crispEdges" data-bridge-qr>
  <rect width="100%" height="100%" fill="#ffffff" />
  <path d={drawn.path} fill="#000000" />
</svg>

<style>
  @layer bridge {
    .bridge-qr {
      display: block;
      margin: 0.5rem 0 0.75rem;
      border-radius: var(--bridge-border-radius, 6px);
    }
  }
</style>
