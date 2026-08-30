# Bridge SvelteKit — Branding

You are applying a workspace's branding (logo, name, colours) inside a SvelteKit application that uses The Bridge.

## Decide first — branding or theming?

These are different things and mixing them up wastes a lot of time.

| You want | This is | Where it lives |
|---|---|---|
| The workspace's logo, name and colours in **your** UI | **Branding** | Live data on `bridge.app.branding` — this guide |
| Restyle the Bridge **components** (login form, plan selector) | **Theming** | Your own CSS / CSS variables |
| Change the logo on Bridge's **hosted** login page and emails | **Branding config** | `update_branding` over MCP, or `bridge branding …` on the CLI |

Branding is **workspace-supplied live data you read and apply yourself**. Bridge does not reach into your components and restyle them — if you want the header to use the brand colour, you write that binding.

## Where it comes from

The branding snapshot arrives on the realtime `session.snapshot` and is replaced wholesale when a new one is pushed. An admin changing the logo is reflected **within seconds, with no reload** — which is the reason to read this reactively rather than fetching once at startup.

```ts
interface BrandingSnapshot {
  logo: string;
  name: string;
  primaryButtonBgColor?: string;
  textColor?: string;
  bgColor?: string;
  fontFamily?: string;
}
```

Everything except `logo` and `name` is optional, so **always supply a fallback**. A workspace that has set no colours yields `undefined`, and interpolating that into a style produces an invalid value rather than a default.

The value is `null` until the first snapshot lands. Guard for it — rendering `b.logo` off a null is the most common crash here.

## Reading it

`bridge.app.branding` is a Svelte store — subscribe with `$`:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const branding = bridge.app.branding;
</script>

{#if $branding}
  <header
    style:background={$branding.bgColor ?? 'var(--surface)'}
    style:color={$branding.textColor ?? 'inherit'}
  >
    <img src={$branding.logo} alt={$branding.name} height="28" />
    <span>{$branding.name}</span>
  </header>
{/if}
```

The `{#if}` matters: the store is `null` until the first snapshot arrives.

## Setting the branding

Not app code. Over MCP: `update_branding`. On the CLI: `bridge branding …`. Or the dashboard. All three write the same record, which then pushes to every connected client.

> `update_branding` is a write tool with real user-visible effect. Confirm with the user before changing a logo or colour — this is the sort of change somebody notices immediately and did not ask for.

## Common mistakes

- **Fetching branding from your own API.** It is already on the live channel; a copy in your backend is stale the moment an admin edits it, and you lose the push.
- **Reading it once at startup.** It updates live; a one-shot read silently reverts the feature to "needs a reload".
- **Assuming the colours exist.** They are optional. Always pass a fallback.
- **Using branding to style the Bridge components.** That is theming — plain CSS.
- **Confusing it with the hosted login page.** Bridge brands its own pages from the same record; nothing you do in app code affects those.

## Related guides

- `integration-prompt.md` — mounting the Bridge runtime, which is what delivers the snapshot
- `team-prompt.md` — the workspace whose branding this is
