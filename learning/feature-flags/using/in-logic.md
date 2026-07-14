# Use flags in your logic

`useFlag` returns a plain reactive value — it isn't tied to markup. You'll
often use it to decide *what to render* (see [Show or hide UI](/feature-flags/using/show-hide-ui/)
for that, using the `<FeatureFlag>` component), but it's just as much for
deciding *what to do*: which function handles something, what limit to
enforce, which calculation to run. This page covers the `useFlag` API itself,
starting with the render case and then a pure-logic one.

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

## Branching plain logic, not markup

The same `useFlag` value works in a function body just as well as in a
template — nothing renders, it just changes which code path runs:

```ts
import { useFlag } from '@nebulr-group/bridge-svelte/flags';

const useV2Pricing = useFlag('pricing_engine_v2', false);
const maxUploads = useFlag('max_uploads', 10);

function calculateTotal(cart: CartItem[]): number {
  // Route to one implementation or the other — no UI involved.
  return useV2Pricing.value ? calculateTotalV2(cart) : calculateTotalV1(cart);
}

function canUploadMore(currentCount: number): boolean {
  // Gate an action with a value an admin can tune without a deploy.
  return currentCount < maxUploads.value;
}
```

Both read the same live, reactive value as the rendering examples above — an
admin ramping `pricing_engine_v2` from 10% to 100%, or raising `max_uploads`
from 10 to 25, takes effect immediately, with no code change on your side.

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
