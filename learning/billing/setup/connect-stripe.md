# Connect Stripe

Bridge runs billing on top of Stripe and manages the integration for you — your
app never talks to Stripe directly or holds Stripe secrets. You connect your
Stripe account once, in the Bridge dashboard, and Bridge handles checkout,
the customer portal, webhooks, and keeping each workspace's subscription in
sync over the live channel.

## How it fits together

- **Your Stripe account** holds the products, prices, and payment data.
- **Bridge plans** map to Stripe prices — see [Define your plans](/api-reference/payments/).
- **Your app** consumes the resulting subscription state through the `bridge`
  surface and the drop-in components — see [How billing works](/billing/how-it-works/).

Once Stripe is connected and your plans are defined, everything else in this
section (paywall, plan switching, the billing portal, entitlements, quotas)
works without any further Stripe wiring on your side.

> Connecting Stripe and mapping prices is an admin/dashboard task, not an SDK
> call. The SDK only ever reads the live subscription state Bridge derives from
> it.
