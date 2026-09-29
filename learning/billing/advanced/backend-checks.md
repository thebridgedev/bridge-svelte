# Check plans on your backend

Plan features and quotas are **billing-derived**: Bridge resolves them from the
subscription of the workspace (called a *tenant* in the API). When a paid action
calls your server, the handler that does the work is where the action happens,
so that is where it is counted and gated.

## Verify the request first

Authenticate the request with the backend SDK so you have a trusted workspace
context (see [Route guards](/auth/securing/route-guards/)). With the NestJS SDK
that is the guard it installs; the decorators below read the verified sign-in
and Bridge's own billing records, never anything the client sends.

## One decorator per handler

Every gate in app code is a flag, on the backend too. A feature a plan sells is
the flag the page already reads (its rule is
`bridge:billing.entitlement.<feature> eq true`, see
[Lock features to a plan](/billing/limits/lock-features/)); a limit is a quota.
With the NestJS SDK each is one decorator on the handler:

```ts
@Post()
@RequireQuota('tickets', { current: (t, self: TicketsController) => self.tickets.countFor(t.id) })
create() { /* ... */ }

@Get('analytics')
@RequireFeatureFlag('analytics')
analytics() { /* ... */ }
```

At the cap `@RequireQuota` answers `402` with
`{ code: 'QUOTA_EXCEEDED', metric, used, limit, fix }`. A flag that is off
because of the plan answers `402 FEATURE_NOT_IN_PLAN`. The Svelte SDK recognises
both and shows the upgrade dialog, so the page that made the request needs no
code for it (see [Show usage limits in your app](/billing/limits/usage-limits/)).
A backend on another framework gets the same dialog by answering with the same
body.

`<QuotaGate>`, `<FeatureFlag>` and the dialog on the page read the same answers,
so the user sees the limit or the upgrade prompt before the click. The backend
counts only what reaches it; never count the same action in the page as well.

## Where the source of truth lives

- **Plan features & quotas** describe what the plan grants. They are the same
  concepts the frontend uses (see [Lock features to a plan](/billing/limits/lock-features/) and
  [Show usage limits in your app](/billing/limits/usage-limits/)).
- For server-side subscription and plan details, call the API:
  [Get subscription state](/api-reference/subscriptions/#get-subscription-state) and
  [Get entitlements](/api-reference/subscriptions/#get-entitlements) in the
  [Subscriptions & Entitlements](/api-reference/subscriptions/) reference.
