---
title: Branding
order: 70
oneLiner: White-label your app per workspace — logo, colours and name that update live over the wire.
related: [multi-tenancy, live-updates]
---

# Branding

Bridge ships a per-workspace **branding snapshot** — logo, display name, and colours — on the unified `bridge` surface. It arrives with the `session.snapshot` and is replaced on every `branding.updated` push, so when an admin changes the logo or brand colour your UI reflects it within seconds, without a reload.

This is distinct from the static [Theming](../theming/theming.md) guide (which styles the Bridge components with your own CSS): branding is **tenant-supplied, live data** you read and apply yourself.

### Reading the branding snapshot

`bridge.app.branding` is a reactive store holding the current snapshot (or `null` before it lands):

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const branding = bridge.app.branding;
</script>

{#if $branding}
  <header style="background: {$branding.bgColor}; color: {$branding.textColor}">
    <img src={$branding.logo} alt={$branding.name} height="28" />
    <span>{$branding.name}</span>
  </header>
{/if}
```

### Snapshot fields

| Field | Type | Description |
|-------|------|-------------|
| `logo` | `string` | URL of the workspace logo |
| `name` | `string` | Workspace / brand display name |
| `primaryButtonBgColor` | `string` | Brand colour for primary actions |
| `textColor` | `string` | Foreground text colour |
| `bgColor` | `string` | Surface background colour |
| `fontFamily` | `string` | Brand font family |

### Applying branding as CSS variables

The cleanest way to white-label a whole app is to map the snapshot onto CSS custom properties once, high in the tree, and let the rest of your styles read them:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';
  const branding = bridge.app.branding;
</script>

<svelte:body
  style:--brand-primary={$branding?.primaryButtonBgColor}
  style:--brand-fg={$branding?.textColor}
  style:--brand-bg={$branding?.bgColor}
/>
```

### Under the hood

- **Live by default** — the snapshot is delivered on `session.snapshot` and swapped wholesale on each `branding.updated` event over the live channel; no polling, no manual refetch.
- **Fail-soft** — `branding` is `null` until the first snapshot lands. Guard your reads (`$branding?.logo`) and fall back to your own defaults so first paint never breaks.
- **Per workspace** — switching workspace (see [Multi-tenancy](../multi-tenancy/multi-tenancy.md)) re-emits the snapshot for the new tenant, so the brand follows the active workspace automatically.
