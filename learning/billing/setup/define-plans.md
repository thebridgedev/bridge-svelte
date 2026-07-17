# Define your plans

**Step 2 of 3.** With [Stripe connected](/billing/setup/connect-stripe/),
the next step is to define the plans your workspaces (called *tenants* in the
API) can subscribe to.

A **plan** is what a workspace subscribes to. Each plan carries:

- **Prices**: one recurring price per currency + billing interval (e.g. a
  monthly USD price and a yearly USD price). Bridge maps each price to a Stripe
  price, so a paid plan needs at least one price before checkout works. A plan
  with no prices behaves as a free plan.
- **Quotas** (optional): usage caps for a metric, e.g. 10,000 AI calls a month.
  See [Show usage limits in your app](/billing/limits/usage-limits/) for how
  these surface in your app.

Whatever you define here is what `<PlanSelector>` and `<BridgePaywall>` render,
and what drives the live `bridge.tenant.subscription` state in your app.

## Three ways to create a plan

You can define plans with the CLI, in Control Center (your admin dashboard at
app.thebridge.dev), or over the REST API. Pick whichever fits your workflow;
all three write to the same place.

### CLI

The `bridge plan` commands are the quickest way to script plans. A plan is
created first (with no prices), then you add prices and optional quotas to it:

```bash
# 1. Create the plan
bridge plan create --key pro --name "Pro" --description "For growing teams"

# 2. Add a recurring price (idempotent by currency + interval)
bridge plan price set pro --amount 49 --interval month --currency USD

# (optional) add a second price for yearly billing
bridge plan price set pro --amount 490 --interval year --currency USD

# 3. (optional) add a usage quota
bridge plan quota set pro --metric ai_completions --limit 10000 --policy hard
```

- `plan create` takes `--key`, `--name`, and optional `--description`,
  `--trial` / `--trial-days`. It deliberately starts with **no prices**; add
  them explicitly in the next step.
- `plan price set <key>` requires `--amount` and `--interval`
  (`day` | `week` | `month` | `year`); `--currency` defaults to `USD`. Re-running
  it for the same currency + interval updates that price.
- `plan quota set <key>` takes `--metric`, `--limit`, and `--policy`
  (`hard` | `metered`). Metered quotas also need a `--price-amount` (per-unit
  price) and, if the plan has prices in more than one currency, a
  `--price-currency`. Inspect a plan and its quotas with `bridge plan get <key>`.

> A paid plan needs at least one price before Stripe Checkout will work. If you
> only run `plan create`, the plan is treated as free.

### Control Center

Prefer a UI? Create and edit plans, prices, and quotas in
[Control Center](https://app.thebridge.dev/subscriptions?tab=plans): the same
fields as the CLI, no terminal required. This is the easiest path for a one-off
setup.

### API

For programmatic setup (provisioning scripts, CI, internal tooling), create and
manage plans over REST. See the
[Payments API reference](/api-reference/payments/) for the full set of endpoints
and the exact plan / price / quota field shapes.

## Reference

The [Payments API reference](/api-reference/payments/) is the source of truth for
every plan field, endpoint, and response shape. This page is the guide; the
reference has the detail.

---

**Next:** [Add billing to your app](/billing/setup/add-billing-to-your-app/):
wire the plans you just defined into your UI.
