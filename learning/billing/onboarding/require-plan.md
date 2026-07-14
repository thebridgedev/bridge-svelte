# Require a plan to use the app

Some apps shouldn't do anything until the workspace is on a plan. "Requiring a plan" means blocking the app until the current workspace has an **active plan** — and letting it through the moment one exists.

A plan counts as active once the workspace has either:

- **selected a free plan** (instant — no payment involved), or
- **completed Stripe Checkout for a paid plan** (a payment method is captured).

Under the hood the gate keys off a single flag on the subscription status: **`shouldSelectPlan`**. While it's `true` the workspace has no active plan and the app should stay blocked; once a plan is selected or checked out it flips to `false` and the app opens up. You never compute this yourself — Bridge derives it from the workspace's billing state.

There are two ways to enforce the gate. Lead with `<BridgePaywall>` — it's the default, blessed approach — and reach for the config paywall route when you'd rather the plan picker be a real routed page than a modal overlay.

## Method 1 — `<BridgePaywall>` (recommended)

`<BridgePaywall>` is a hard gate you wrap around your app: it blocks everything until a plan is active — no `shouldSelectPlan` checks or redirects to wire yourself. Put it in your root `+layout.svelte` and pass your app as children.

While `shouldSelectPlan` is true it renders a full-screen modal with a `<PlanSelector>` inside; otherwise it renders its children (your app).

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgePaywall } from '@nebulr-group/bridge-svelte';

  let { children } = $props();
</script>

<BridgePaywall successRedirect="/welcome" cancelRedirect="/plans">
  <!-- your app — only rendered once a plan is active -->
  {@render children()}
</BridgePaywall>
```

> **Tip:** In Svelte 5 you pass your app as `children` and render it with `{@render children()}` — there's no `<slot />`. `<BridgePaywall>` calls `{@render children?.()}` internally only when a plan is active, so nothing behind the gate mounts until then.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `onSelect` | `({ plan, price }) => void` | — | Called after free-plan selection or a direct plan change (not the Stripe redirect path) — use for analytics side-effects |
| `heading` | `Snippet` | "Choose a plan" | Override the modal heading |
| `children` | `Snippet` | — | Your app. Rendered only once a plan is active |

What the user sees: a workspace with no plan lands on a full-screen modal with the plan picker and cannot get past it. The instant they pick a plan (or return from checkout), the modal disappears and your app renders in its place.

## Method 2 — config paywall route

Prefer this when you want the plan picker to be a **real routed page** rather than a modal overlay — for example a dedicated `/plans` onboarding step with its own layout, copy, and URL you can link to.

Set `billing.paywallRoute` in your bridge config:

```ts
// bridge config
export const config = {
  appId: '...',
  billing: {
    paywallRoute: '/plans',
  },
};
```

Then render a `<PlanSelector>` at that route:

```svelte
<!-- src/routes/plans/+page.svelte -->
<script lang="ts">
  import { PlanSelector } from '@nebulr-group/bridge-svelte';
</script>

<PlanSelector successRedirect="/welcome" cancelRedirect="/plans" />
```

`<BridgeBootstrap />` handles the gate for you: before any page renders it checks the subscription status, and if the authenticated workspace still needs to pick a plan it issues a redirect to `paywallRoute`. It only redirects when all of the following hold, so there's no redirect loop and no gate on exempt workspaces:

- `billing.paywallRoute` is configured
- the current path isn't already the paywall route
- the workspace is authenticated but has `shouldSelectPlan: true`
- the workspace hasn't opted out via `paymentsAutoRedirect: false`

> **Tip:** `<PlanSelector>` is the same picker `<BridgePaywall>` renders inside its modal. See [Choose & switch plans](/billing/onboarding/choose-switch-plans/) for its full prop table and customization options.

## The end-to-end flow

Both methods drive the same underlying flow:

1. A user signs in to a workspace that has **no active plan** → `shouldSelectPlan` is `true`.
2. The **gate** engages — the `<BridgePaywall>` modal appears, or `<BridgeBootstrap />` redirects to your `paywallRoute` page.
3. The user picks a plan from the `<PlanSelector>`:
   - **Free plan** → activated instantly, no payment. `onSelect` fires and the store refreshes.
   - **Paid plan** → the user is sent to **Stripe Checkout** to capture a payment method.
4. On successful payment the user returns to your app at **`successRedirect`**; if they cancel, they land on **`cancelRedirect`**.
5. With a plan now active, `shouldSelectPlan` flips to `false` → the **gate opens** and your app renders.

## Opting out — `paymentsAutoRedirect: false`

`paymentsAutoRedirect` is a flag on the subscription status. When it's `false`, the workspace **has opted out of the platform's native plan-selection gate** — such workspaces are exempt from the automatic block. Both methods above respect it: `<BridgePaywall>` renders its children instead of the modal, and `<BridgeBootstrap />` skips the paywall redirect entirely.

This exists so certain workspaces can bypass the forced plan choice — for example accounts provisioned or billed out-of-band, where forcing a plan selection in the app would be wrong. Those workspaces still reach your app normally; you're free to render your own `<PlanSelector>` where it makes sense, but the platform won't block them for you.

`successRedirect` and `cancelRedirect` are independent of this flag — they're simply where the user lands after leaving Stripe Checkout (success or cancel, respectively). They default to `'/'` on `<BridgePaywall>`.
