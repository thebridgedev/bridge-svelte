# Use flags in your logic

## useFlag — reactive flag values

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const banner = useFlag('show_banner', false);
</script>

{#if banner.value}
  <div class="banner">New stuff!</div>
{/if}
```

`useFlag(key, defaultValue, context?)` returns `{ value, passed }` backed by Svelte 5 runes:

| Field | Description |
|-------|-------------|
| `value` | The evaluated flag value, typed from your default (`boolean` \| `string` \| `number` \| JSON object) |
| `passed` | Whether a rule branch matched |

The result is **reactive**: when an admin changes the flag (or a live rule update arrives), `value` updates in place. The default is mandatory — it's what your app gets when the flag isn't configured or Bridge is unreachable. A flag call can never break your app.

All three arguments accept getter functions for reactive inputs:

```svelte
<script lang="ts">
  const greeting = useFlag(
    () => `greeting_${locale}`,        // reactive key
    'Hello',
    () => ({ attributes: { locale } }) // reactive per-call context
  );
</script>
```

## flagStore — store-contract variant

For code that prefers the Svelte store contract (e.g. usage outside `.svelte` files):

```ts
import { flagStore } from '@nebulr-group/bridge-svelte/flags';

const banner = flagStore('show_banner', false);
const unsubscribe = banner.subscribe(({ value, passed }) => {
  // re-runs on every live flag change
});
```

## Multi-type values

One API for boolean, string, number, and JSON flags — the type is inferred from the default:

```ts
const isDark = useFlag('dark_mode', false);
const cta    = useFlag('checkout_text', 'Submit');
const limit  = useFlag('max_uploads', 10);
const cfg    = useFlag('rate_limit', { window: 60, max: 100 });
```

A type mismatch (admin stored a different type than your default suggests) returns the default and logs a warning.
