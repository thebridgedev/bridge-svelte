---
title: Branding
order: 70
oneLiner: White-label your app per workspace with a logo, colours and name that update live over the wire.
related: [live-updates]
---

# Branding

Bridge ships a **branding snapshot** for each workspace (called a *tenant* in the API): logo, display name, and colours, exposed on [the `bridge` object](/live-updates/). It arrives with the `session.snapshot` and is replaced on every `branding.updated` push, so when an admin changes the logo or brand colour your UI reflects it within seconds, without a reload.

This is distinct from the static [Theming](/theming/) guide (which styles the Bridge components with your own CSS): branding is **workspace-supplied, live data** you read and apply yourself.

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
| `primaryButtonBgColor` | `string` (optional) | Brand colour for primary actions |
| `textColor` | `string` (optional) | Foreground text colour |
| `bgColor` | `string` (optional) | Surface background colour |
| `fontFamily` | `string` (optional) | Brand font family |

Only `logo` and `name` are always present; guard the four optional fields (or fall back to your own defaults) when you apply them.

### Applying branding as CSS variables

The cleanest way to white-label a whole app is to map the snapshot onto CSS custom properties once, high in the tree, and let the rest of your styles read them. Set the properties on `document.body` from an effect in your root layout:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const branding = bridge.app.branding;

  $effect(() => {
    const vars: Record<string, string | undefined> = {
      '--brand-primary': $branding?.primaryButtonBgColor,
      '--brand-fg': $branding?.textColor,
      '--brand-bg': $branding?.bgColor,
    };
    for (const [name, value] of Object.entries(vars)) {
      if (value) document.body.style.setProperty(name, value);
      else document.body.style.removeProperty(name);
    }
  });
</script>
```

> Don't reach for `<svelte:body style:...>` here. `<svelte:body>` only supports event listeners and actions; Svelte 5 accepts a style directive on it but silently ignores it, so nothing gets applied. If you prefer to stay in markup, put the style directives on a wrapper element around your app instead.

### Under the hood

- **Live by default**: the snapshot is delivered on `session.snapshot` and swapped wholesale on each `branding.updated` event over the live channel (a persistent realtime connection the SDK maintains); no polling, no manual refetch.
- **Fail-soft**: `branding` is `null` until the first snapshot lands. Guard your reads (`$branding?.logo`) and fall back to your own defaults so first paint never breaks.
- **Per workspace**: switching workspace (see [Multi-tenancy](/auth/multi-tenancy/)) re-emits the snapshot for the new workspace, so the brand follows the active workspace automatically.
