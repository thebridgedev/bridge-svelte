# Bridge SvelteKit — Billing (bridge-svelte 1.0)

You are adding **plans and payments** to a SvelteKit app with `@nebulr-group/bridge-svelte` 1.0. Bridge keeps the subscription and talks to Stripe; the app never handles a card. The plugin shows the plans, sends people to Stripe's checkout, brings them back, opens the billing portal, and tells people about trials, failed payments and plan limits. If Bridge is not set up in the project yet, do `bridge guide svelte` (MCP: `get_integration_guide topic=integration framework=svelte`) first.

`bridge guide billing` (MCP: `get_integration_guide topic=billing-master`) is the end-to-end billing journey across frameworks; `bridge guide fit-together` (MCP: `topic=fit-together`) explains how plans, limits, roles and flags fit together. Read `fit-together` before setting up plans.

## The one rule for app code

**Every gate in app code is a flag.** Whether someone gets a feature is a flag whose rule names the plan feature: `bridge:billing.entitlement.<feature> eq true`. App code never reads the plan, a plan feature, a role or a privilege list to decide what someone may see or do; the billing facts (plan name, trial end, usage) are for showing only.

Two things are not gates: **numbers** are plan limits (below), and **permission on one specific record** stays in app code.

The server enforces: the endpoint that creates the thing holds a unit of the limit and refuses over it, and checks the flag. The browser shows or hides: the plan page, the notices, `<QuotaGate>` and the upgrade dialog tell people where they stand and offer the upgrade.

Before calling the work done, run `npx @nebulr-group/bridge-cli@alpha check gates` and fix what it lists.

## Decide first: plans are the developer's

Plan names, prices, currencies, trials, features and limits are product decisions. Ask the developer and wait; never invent a price or a trial. Then create each plan in one step:

| | MCP | CLI 1.0 |
|---|---|---|
| A plan with prices, trial, features and limits | `apply_plan` | `bridge plan create <key> --name <name> --price "19 EUR/month" --price "190 EUR/year" --trial-days 14 --feature analytics --limit tickets=100` (or `--no-trial`) |
| Read them | `list_plans`, `get_plan` | `bridge plan list`, `bridge plan get <key>` |
| Change one part | `set_plan_price`, `add_plan_feature`, `set_plan_quota` | `bridge plan price set <plan> "<amount> <CURRENCY>/<interval>"`, `bridge plan feature add <plan> <feature>`, `bridge plan limit set <plan> tickets=100` |
| What the app counts | `list_plan_quotas` | `bridge metric list`, `bridge metric set <key> --kind counter` (or `gauge`) |
| A per-unit price instead of a hard limit | `set_plan_quota` with `policy: "metered"` | `bridge plan update <key> --usage-price "api.calls 0.002 EUR/month included 10000"` |
| A plan file | `apply_plan` | `bridge plan apply <file>` |

A free plan is a plan with a `0` price. A limit is hard (refused over it); a usage price is metered (the overage is billed, never refused). `seats` is built in: Bridge counts the workspace's members and refuses an invite over the plan's `seats` limit itself.

## Stripe

`bridge stripe status` (MCP: `get_stripe_status`) says whether payments are connected. To connect in test mode, the developer runs `bridge stripe connect` and pastes their `sk_test_…` key (it is asked for without echo; never put a key in a command line or a file). Live keys come at going live (`bridge guide decision going-live`). Checkout returns to the app's subscription page on one of the app's registered browser addresses, which every app already has; `bridge billing settings --return-url <url>` (MCP: `update_app` `checkoutReturnUrl`) sets another.

## Step 1: the billing pages, one file

```svelte
<!-- src/routes/subscription/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
```

| Page | What it does |
|---|---|
| `/subscription` | The current plan, the billing portal button, changing plan |
| `/subscription/plan` | Picking a plan to start: the paywall page. Once a plan is active, the person goes back where they were |
| `/subscription/error` | Where a failed checkout lands |
| `/subscription/success` | Older checkout returns; goes on to `/subscription` |

- Every page has a "Back" link to `/`: `billing: { back: '/dashboard' }` in `bridgeBootstrap`, `back={false}` for none.
- Move the pages with `billing: { base: '/billing' }` (and the file with them).
- **The paywall**: while the standard flag `bridge-app-active` is off for a workspace (it is on while the workspace has a plan, or the app sells none), signed-in people on protected pages go to the plan page. Move it with `billing: { paywall: '/welcome' }`, or turn it off with `billing: { paywall: false }`.
- `<CheckoutNotice>` on the subscription page confirms a checkout once on return and shows "You're on Pro now". Put it on any other page the checkout returns to.

A link to the subscription page in the app's navigation, behind the standard flag that says who may manage billing:

```svelte
<FeatureFlag key="bridge-billing-manage"><a href="/subscription">Billing</a></FeatureFlag>
```

### The welcome page: offer it, never create it unasked

A `/welcome` page for new customers (a plan choice in the app's own words) is an offer: suggest it in one line, and build it only if the developer says yes, as a page with `<PlanPicker />` and `billing: { paywall: '/welcome' }`.

## Step 2: notices

```svelte
<!-- src/routes/+layout.svelte, inside <BridgeBootstrap> -->
<script lang="ts">
  import { BillingNotice } from '@nebulr-group/bridge-svelte';
</script>

<BillingNotice />
```

It shows the one notice worth showing now: blocked, payment due, needs a plan, trial ending, ending, or a change waiting. `mode="hard"` covers the page while the workspace is locked for payment; the owner leaves through the billing page. `$billingGate` (`{ locked, severity, noticeState, recoveryUrl }`) and `$billingLocked` are the lock as stores.

## Step 3: plan features are flags

List the feature on the plan, rule a flag on it, and gate on the flag:

```bash
bridge plan feature add pro analytics
bridge flag create analytics --when "bridge:billing.entitlement.analytics eq true"
```

```svelte
<FeatureFlag key="analytics" upgrade>
  <Analytics />
</FeatureFlag>
```

A page is a route rule `{ match: '/analytics', featureFlag: 'analytics', redirectTo: '/subscription' }`. With `upgrade`, a workspace whose plan lacks the feature sees an upgrade prompt that opens the upgrade dialog. `bridge guide svelte feature-flags` has the rest.

## Step 4: plan limits

### The server refuses over the limit

The endpoint that creates the thing holds one unit first. `@nebulr-group/bridge-svelte/server` checks the caller; the server client on `event.locals.bridge.server` holds the unit. Both need the app key, made with `bridge key create --name <name>` (its secret is shown once: put it in the server's secrets as `BRIDGE_APP_KEY`, never in a `PUBLIC_` variable).

```ts
// src/hooks.server.ts
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { bridgeHandle } from '@nebulr-group/bridge-svelte/server';

export const handle = bridgeHandle({ issuer: publicEnv.PUBLIC_BRIDGE_ISSUER, appKey: env.BRIDGE_APP_KEY });
```

```ts
// src/routes/api/tickets/+server.ts
import { json } from '@sveltejs/kit';
import { requireFlag } from '@nebulr-group/bridge-svelte/server';
import { isLimitReached, quotaExceededBody } from '@nebulr-group/bridge-auth-core/server';

export const POST = async (event) => {
  const actor = await requireFlag(event, 'tickets');
  let hold;
  try {
    hold = await event.locals.bridge.server.usage.hold(actor, 'tickets');
  } catch (error) {
    if (isLimitReached(error)) return json(quotaExceededBody(error), { status: 402 });
    throw error; // Bridge could not be asked: not a yes
  }
  try {
    const ticket = await createTicket(actor.workspaceId, await event.request.json());
    await hold.confirm();
    return json(ticket, { status: 201 });
  } catch (error) {
    await hold.giveBack();
    throw error;
  }
};
```

`@nebulr-group/bridge-auth-core` comes with the plugin; add it with `@alpha` if the package manager does not let the app import it. Only count what has no limit to hold: `meter(event, 'exports')` from `@nebulr-group/bridge-svelte/server` reports usage in batches without refusing. A metered limit is never refused; the overage is billed. A NestJS backend uses `@Meter` and the 1.0 plugin's limit checks instead (`bridge guide nestjs billing`).

### The browser shows where people stand

- **Level 0, no code**: call the endpoint with `bridgeFetch`. A `402` that says a limit was reached opens the upgrade dialog by itself.

  ```ts
  import { bridgeFetch } from '@nebulr-group/bridge-svelte';
  const response = await bridgeFetch('/api/tickets', { method: 'POST', body: JSON.stringify(input) });
  ```

- **Level 1**: `<QuotaGate>` disables the actions inside once the metric is at its hard limit, with an upgrade line; `<QuotaBanner metric="tickets" />` says the limit is near (from 80%) or reached.

  ```svelte
  <script lang="ts">
    import { QuotaGate } from '@nebulr-group/bridge-svelte';
  </script>

  <QuotaGate metric="tickets">
    <button onclick={createTicket}>New ticket</button>
    {#snippet atLimit(quota)}{quota.used} of {quota.limit} used. <a href="/subscription">Upgrade</a>{/snippet}
  </QuotaGate>
  ```

- **Level 2**: your own display with `useQuota('tickets')`: `loading`, `unlimited`, `used`, `limit`, `remaining`, `warningLevel`, `kind`, `snapshot`. The numbers move by themselves when usage or the plan changes; while loading they are `null`, never a made-up 0.

Do not proxy usage through your own API for the display: the plugin reads it from Bridge. `onBridgeQuotaExceeded((refusal) => …)` runs your code for each refused limit; `billing: { upgradeDialog: MyDialog }` replaces the dialog, `false` turns it off.

## Step 5: the billing portal and the plan

`<BillingPortalButton />` opens Stripe's billing portal and `<PlanPicker />` the plan choice; both show their controls only to people the `bridge-billing-manage` flag lets in. `<CurrentPlan />` and `<SubscriptionStatus />` show the plan; `billing`, `plans` and `usage` are the stores behind them, for showing only.

## Checklist

- [ ] Plans, prices, trials, features and limits are the developer's answers (`bridge plan list`)
- [ ] `bridge stripe status` says connected (test mode while developing)
- [ ] `src/routes/subscription/[...bridge]/+page.svelte` renders `<BridgeBillingRoutes />`
- [ ] `<BillingNotice />` in the root layout
- [ ] Every plan-sold feature is a flag ruled on `bridge:billing.entitlement.<feature>`, gated with `<FeatureFlag>` or a route rule
- [ ] Every endpoint that creates a limited thing holds a unit and answers 402 with `quotaExceededBody` over the limit
- [ ] The browser calls those endpoints with `bridgeFetch`
- [ ] `npx @nebulr-group/bridge-cli@alpha check gates` is clean

## Verify

Run the terminal checks. If you have a browser tool, run the browser checks too. If you do not, list them for the developer, numbered, and start the summary with a Heads up line saying which checks were not run.

### Terminal checks

1. The build passes.
2. `npx @nebulr-group/bridge-cli@alpha check gates` lists nothing.
3. `bridge plan list` shows the plans with the prices, trials, features and limits the developer chose.
4. `bridge stripe status` says connected.
5. `bridge flag get <key>` for each plan-feature flag shows a rule on `bridge:billing.entitlement.<feature>`, never a plan.
6. With a server endpoint under a limit: call it at the limit with a signed-in person's token and expect `402` with `"code": "QUOTA_EXCEEDED"`; without a token expect `401`.

The app runs with `ssr = false`, so `curl` of a page returns an empty shell: it is no substitute for the browser checks.

### Browser checks

1. `/subscription/plan` shows every plan, with both intervals on one card where a plan has two.
2. Choosing the free plan lands back in the app.
3. A paid plan opens Stripe's checkout.
4. A test payment (card `4242 4242 4242 4242`) returns to `/subscription` with "You're on <plan> now"; a cancelled checkout returns without a change.
5. A workspace with no plan, on a protected page, lands on the plan page (the paywall).
6. Over a limit, the action is refused and the upgrade dialog opens.

Stripe's checkout page may refuse an automated browser: then that check goes to the developer too. Never call a browser check done when you did not run it. When any was not run, the summary starts with "Heads up: not verified in a browser" and lists them for the developer, numbered.
