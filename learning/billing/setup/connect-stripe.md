# Connect Stripe

**Step 1 of 3.** Getting billing into your app is three steps:

1. **Connect Stripe** (this page)
2. [**Define your plans**](/billing/setup/define-plans/)
3. [**Add billing to your app**](/billing/setup/add-billing-to-your-app/)

Bridge runs billing on top of Stripe and manages the integration for you: your
app never talks to Stripe directly or holds Stripe secrets. You connect your
Stripe account once, in Control Center (your admin dashboard at
app.thebridge.dev), and Bridge handles checkout, the customer portal, webhooks,
and keeping the subscription of each workspace (called a *tenant* in the API)
in sync over the live channel (a persistent realtime connection the SDK
maintains).

## How it fits together

- **Your Stripe account** holds the products, prices, and payment data.
- **Bridge plans** map to Stripe prices; see [Define your plans](/billing/setup/define-plans/).
- **Your app** consumes the resulting subscription state through the `bridge`
  object and the drop-in components; see [How billing works](/billing/how-it-works/).

Once Stripe is connected and your plans are defined, everything else in this
section (paywall, plan switching, the billing portal, entitlements, quotas)
works without any further Stripe wiring on your side.

> Connecting Stripe and mapping prices is a Control Center task, not an SDK
> call. The SDK only ever reads the live subscription state Bridge derives from
> it.

**Next:** [Define your plans](/billing/setup/define-plans/), the plans your
workspaces can subscribe to.
