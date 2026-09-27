# Require a plan to use the app

Some apps shouldn't do anything until the workspace (called a *tenant* in the API) is on a plan. "Requiring a plan" means blocking the app until the current workspace has an **active plan**, and letting it through the moment one exists.

A plan counts as active once the workspace has either:

- **selected a free plan** (instant, no payment involved), or
- **completed Stripe Checkout for a paid plan** (a payment method is captured).

Under the hood the gate keys off a single flag on the subscription status: **`shouldSelectPlan`**. While it's `true` the workspace has no active plan and the app should stay blocked; once a plan is selected or checked out it flips to `false` and the app opens up. You never compute this yourself; Bridge derives it from the workspace's billing state. (This is the onboarding gate. A workspace that *had* a plan and lost it, say after exhausted payment retries, is **billing-locked** instead, which is a separate signal. See [How billing works](/billing/how-it-works/#when-billing-locks-the-app) for how the two relate.)

There are three ways to enforce the gate. The first needs no code of its own.

## Method 1: the default paywall page (recommended)

If your app has the billing catch-all from [Add billing to your app](/billing/setup/add-billing-to-your-app/):

```svelte
<!-- src/routes/subscription/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
```

the gate is already on. `bridgeBootstrap()` checks the subscription status before any page renders, and a signed-in workspace that still needs to pick a plan is redirected to **`/subscription/plan`**, a plan picker that file serves. A completed checkout lands on `/subscription/success`; one that could not be confirmed lands on `/subscription/error`, which the gate leaves alone so the user can read what happened.

It only redirects when all of the following hold, so there's no redirect loop and no gate on exempt workspaces:

- `billing.paywallRoute` is not `false`
- the current path isn't the paywall page or the payment-error page
- the workspace is authenticated but has `shouldSelectPlan: true`
- the workspace hasn't opted out via `paymentsAutoRedirect: false`

## Method 2: your own onboarding page

When the plan choice should be an onboarding step with its own address and copy, for example `/welcome`, render `<BridgePaywallPage>` there:

```svelte
<!-- src/routes/welcome/+page.svelte -->
<script lang="ts">
  import { BridgePaywallPage } from '@nebulr-group/bridge-svelte';
</script>

<BridgePaywallPage heading="Pick a plan to get started">
  <p>One step left: choose the plan that fits your team.</p>
</BridgePaywallPage>
```

and point the paywall at it in the `bridgeBootstrap({ … })` call in `+layout.ts`:

```ts
export const load = bridgeBootstrap({
  // …your existing options…
  billing: { paywallRoute: '/welcome' },
});
```

The redirect happens before any page renders, including before `/welcome` has ever been visited, which is why the address has to be in config. (In a development build, `<BridgePaywallPage>` mounted anywhere the paywall does not point says so in the console.)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `heading` | `string` | `'Choose a plan'` | The page heading |
| `children` | `Snippet` | (none) | Content between the heading and the plans |
| `successRedirect` | `string` | `'/subscription/success'` | Where a completed checkout lands |
| `cancelRedirect` | `string` | this page | Where a cancelled checkout lands |
| `onSelect` | `({ plan, price }) => void` | (none) | Called after a free-plan selection or direct plan change |

## Method 3: `<BridgePaywall>` overlay

To gate in place with a full-screen modal instead of a redirect, wrap your app in `<BridgePaywall>` in your root `+layout.svelte`, and turn the redirect off with `billing: { paywallRoute: false }` so the two don't both fire.

While `shouldSelectPlan` is true it renders a full-screen modal with a `<PlanSelector>` inside; otherwise it renders its children (your app).

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgePaywall } from '@nebulr-group/bridge-svelte';

  let { children } = $props();
</script>

<BridgePaywall successRedirect="/" cancelRedirect="/">
  <!-- your app: only rendered once a plan is active -->
  {@render children()}
</BridgePaywall>
```

> **Tip:** In Svelte 5 you pass your app as `children` and render it with `{@render children()}`; there's no `<slot />`. `<BridgePaywall>` calls `{@render children?.()}` internally only when a plan is active, so nothing behind the gate mounts until then.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `onSelect` | `({ plan, price }) => void` | (none) | Called after free-plan selection or a direct plan change (not the Stripe redirect path); use for analytics side-effects |
| `heading` | `Snippet` | "Choose a plan" | Override the modal heading |
| `children` | `Snippet` | (none) | Your app. Rendered only once a plan is active |

> **Tip:** `<PlanSelector>` is the picker all three methods render. See [Choose & switch plans](/billing/onboarding/choose-switch-plans/) for its full prop table and customization options.

## The end-to-end flow

All three methods drive the same underlying flow:

1. A user signs in to a workspace that has **no active plan** → `shouldSelectPlan` is `true`.
2. The **gate** engages: `bridgeBootstrap()` redirects to the paywall page (`/subscription/plan`, or your own), or the `<BridgePaywall>` modal appears.
3. The user picks a plan from the `<PlanSelector>`:
   - **Free plan** → activated instantly, no payment. `onSelect` fires and the store refreshes.
   - **Paid plan** → the user is sent to **Stripe Checkout** to capture a payment method.
4. On successful payment the user returns to your app at **`successRedirect`**; if they cancel, they land on **`cancelRedirect`**.
5. With a plan now active, `shouldSelectPlan` flips to `false` → the **gate opens** and your app renders.

## Opting out: `paymentsAutoRedirect: false`

`paymentsAutoRedirect` is a flag on the subscription status. When it's `false`, the workspace **has opted out of the platform's native plan-selection gate**; such workspaces are exempt from the automatic block. Every method above respects it: `<BridgePaywall>` renders its children instead of the modal, and `bridgeBootstrap()` skips the paywall redirect entirely.

This exists so certain workspaces can bypass the forced plan choice, for example accounts provisioned or billed out-of-band, where forcing a plan selection in the app would be wrong. Those workspaces still reach your app normally; you're free to render your own `<PlanSelector>` where it makes sense, but the platform won't block them for you.

`successRedirect` and `cancelRedirect` are independent of this flag; they're simply where the user lands after leaving Stripe Checkout (success or cancel, respectively). They default to `/subscription/success` and the page itself on the paywall pages, and to `'/'` on `<BridgePaywall>`.
