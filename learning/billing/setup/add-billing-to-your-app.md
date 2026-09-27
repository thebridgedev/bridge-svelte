# Add billing to your app

**Step 3 of 3.** With [Stripe connected](/billing/setup/connect-stripe/) and your
[plans defined](/billing/setup/define-plans/), you can now use billing inside your
app. You can detect a first-time user and show them your plans, give users a
subscription page to upgrade or downgrade, and surface billing statuses, like a
payment that didn't go through. This page briefly covers each capability and links
out where we go deeper.

## Prerequisite: auth + bootstrap

Billing rides on the same setup as auth. Before anything here works you need
Bridge auth configured and your app wrapped in `<BridgeBootstrap>` in your root layout.
See [Authentication](/auth/) if you haven't done that yet, and
[How billing works](/billing/how-it-works/) for the model.

## Billing state is already live, with no init call

Once `bridgeBootstrap()` runs in your `+layout.ts` and `<BridgeBootstrap>`
mounts in your `+layout.svelte`, billing is **already live**. Bootstrap fetches
the subscription for the current workspace (called a *tenant* in the API),
auto-mounts the billing notice/gate, and redirects to the billing pages below.
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

## Add the billing pages: one file

Every billing page your app needs comes from one file:

```svelte
<!-- src/routes/subscription/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
```

| Address | What it shows |
|---|---|
| `/subscription` | The current plan, the plan picker to upgrade or downgrade, and "Manage billing" (the Stripe portal) |
| `/subscription/plan` | The paywall: where a workspace with no plan is sent |
| `/subscription/success` | Where a completed checkout lands |
| `/subscription/error` | Where a checkout that could not be confirmed lands |

Those are the defaults of the three billing routes, so there is nothing to
configure and nothing Bridge redirects to is a 404:

| Config | Default | Used for |
|---|---|---|
| `billing.manageRoute` | `/subscription` | The Upgrade/Manage buttons in `<BridgeBillingNotice>` and `<BridgeQuotaBanner>` |
| `billing.paywallRoute` | `/subscription/plan` | Where a signed-in workspace (called a *tenant* in the API) with no plan is sent, **before any page renders** |
| `billing.paymentErrorRoute` | `/subscription/error` | Where a failed checkout confirmation lands |

Workspaces that opt out via `paymentsAutoRedirect: false` are never redirected.
An unknown address under `/subscription` gets your app's own 404. The file can
live under another folder; links between its pages follow it.

**Customising**, in rungs: restyle with the `--bridge-*` CSS tokens; replace
the frame around every page with a `frame(page, content)` snippet and each
heading with `heading(page)`; or take over one page by creating it
(`src/routes/subscription/plan/+page.svelte` wins over the catch-all, and the
others keep working).

## Adding billing to your UI

Here are three use cases for billing in your UI:

**1. Letting users select a plan after first signup**: already done. A
brand-new workspace with no plan is sent to `/subscription/plan` before any page
renders, and gets into the app once it picks one.

Two optional variations:

- **An onboarding page at an address of your choosing**, e.g. `/welcome`. Render
  `<BridgePaywallPage>` there and point the paywall at it:

  ```svelte
  <!-- src/routes/welcome/+page.svelte -->
  <script lang="ts">
    import { BridgePaywallPage } from '@nebulr-group/bridge-svelte';
  </script>

  <BridgePaywallPage heading="Pick a plan to get started" />
  ```

  ```ts
  // src/routes/+layout.ts
  export const load = bridgeBootstrap({
    // …your existing options…
    billing: { paywallRoute: '/welcome' },
  });
  ```

  The config line is needed because the redirect happens before any page
  renders, including before `/welcome` has ever been visited.

- **A modal instead of a redirect**: wrap your root layout in `<BridgePaywall>`
  and turn the redirect off with `billing: { paywallRoute: false }`.

→ [Require a plan to use the app](/billing/onboarding/require-plan/)

**2. A self-service subscription page**: also done. `/subscription` shows the
current plan and the plan picker, so users upgrade or downgrade from your app.

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
