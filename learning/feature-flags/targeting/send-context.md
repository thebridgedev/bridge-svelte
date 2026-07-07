# Send context from your code

## Per-call context

The optional third argument supplies per-call identity/attributes. Per-call attributes win over everything else on key collision:

```ts
const checkout = useFlag('new_checkout', false, () => ({
  attributes: { cart_size: cart.items.length },
}));
```

## App-wide attributes (`bridge.attributes`)

For attributes that every flag evaluation should see — not just one call site — publish them once on the unified bridge surface:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.attributes.set('beta_cohort', true);                    // static value
bridge.attributes.bind('cart_size', () => cart.items.length); // re-read on every eval
bridge.attributes.bindMany(() => ({ theme, locale }));         // bulk getter
```

Precedence on key collision: per-call context > `bridge.attributes` > Bridge-managed providers. The `bridge:` namespace is reserved — writes to it are rejected with a console warning. See the Live Updates guide for the full `bridge.attributes` API.
