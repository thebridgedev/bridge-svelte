# Add billing to your app

**Step 3 of 3.** With [Stripe connected](/billing/setup/connect-stripe/) and your
[plans defined](/billing/setup/define-plans/), you can now use billing inside your
app. You can detect a first-time user and show them your plans, give users a
subscription page to upgrade or downgrade, and surface billing statuses, like a
payment that didn't go through. This page briefly covers each capability and links
out where we go deeper.

## Prerequisite: auth + bootstrap

Billing rides on the same setup as auth. Before anything here works you need
Bridge auth configured and `<BridgeBootstrap />` mounted in your root layout.
See [Authentication](/auth/) if you haven't done that yet, and
[How billing works](/billing/how-it-works/) for the model.

## Billing state is already live, with no init call

Once `bridgeBootstrap()` runs in your `+layout.ts` and `<BridgeBootstrap />`
mounts in your `+layout.svelte`, billing is **already live**. Bootstrap fetches
the subscription for the current workspace (called a *tenant* in the API),
auto-mounts the billing notice/gate, and honors your configured billing routes.
There is **no separate billing init call**.

State lands on the unified `bridge` object and updates over the live channel
(a persistent realtime connection the SDK maintains):

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const subscription = bridge.tenant.subscription;   // plan, status, trial
  const entitlements = bridge.tenant.entitlements;   // what the plan grants
</script>

{#if $subscription}
  <p>Plan: {$subscription.plan.name} ({$subscription.status})</p>
{/if}
```

## Configure your billing routes

Add a `billing` block to the `BridgeConfig` you already pass to `bridgeBootstrap`
in `+layout.ts`:

```ts
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';
import type { BridgeConfig } from '@nebulr-group/bridge-svelte';
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
  const config: BridgeConfig = {
    appId: import.meta.env.VITE_BRIDGE_APP_ID,
    loginRoute: '/auth/login',
    billing: {
      paywallRoute: '/subscription',       // send plan-less workspaces here
      paymentErrorRoute: '/payment-error', // land here if a checkout confirmation fails
    },
  };

  await bridgeBootstrap(url, config);
  return {};
};
```

- **`paywallRoute`**: when set, bootstrap redirects an authenticated workspace
  that hasn't selected a plan here **before the page renders**. Point it at
  wherever your `<PlanSelector>` lives. (Workspaces that opt out via
  `paymentsAutoRedirect: false` are exempt.)
- **`paymentErrorRoute`**: where Bridge sends the user if a Stripe checkout
  confirmation fails on the return trip. Defaults to `/payment-error`.

Both are optional. Leave `paywallRoute` unset if you'd rather gate the app with
`<BridgePaywall>` (below) than redirect.

## Adding billing to your UI

Here are three use cases for billing in your UI:

**1. Letting users select a plan after first signup**: wrap your root layout in
`<BridgePaywall>`; it blocks the app and shows a plan picker until the workspace
has an active plan, so a brand-new user picks a plan before they get in:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgePaywall } from '@nebulr-group/bridge-svelte';
  let { children } = $props();
</script>

<BridgePaywall successRedirect="/welcome" cancelRedirect="/subscription">
  {@render children()}
</BridgePaywall>
```

→ [Require a plan to use the app](/billing/onboarding/require-plan/)

**2. A self-service subscription page**: drop `<PlanSelector />` onto a route. It
loads all the plans so your users can upgrade or downgrade directly from your app:

```svelte
<!-- src/routes/subscription/+page.svelte -->
<script lang="ts">
  import { PlanSelector } from '@nebulr-group/bridge-svelte';
</script>

<PlanSelector successRedirect="/subscription/success" cancelRedirect="/subscription" />
```

→ [Choose & switch plans](/billing/onboarding/choose-switch-plans/)

**3. Surface billing health**: `<BridgeBillingNotice />` renders nothing while
the subscription is healthy and the right banner (trial ending, payment failed,
canceled) when it needs attention. Put it once in your root layout:

```svelte
<script lang="ts">
  import { BridgeBillingNotice } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingNotice />
```

→ [Warn about billing problems](/billing/status/billing-notices/)

> That's the whole quickstart. From here, the rest of the billing section covers
> depth: [subscription status](/billing/status/subscription-status/),
> [usage limits](/billing/limits/usage-limits/),
> [free trials](/billing/lifecycle/free-trials/),
> [the billing portal](/billing/lifecycle/billing-portal/), and
> [failed-payment handling](/billing/lifecycle/failed-payments/), each building
> on the live `bridge` object you now have wired up.
