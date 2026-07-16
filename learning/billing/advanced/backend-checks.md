# Check plans on your backend

Plan, entitlements, and quotas are **billing-derived**: Bridge resolves them
from the subscription of the workspace (called a *tenant* in the API). The
browser reads them live from the `bridge` object, but your server should
enforce them too: never trust the client for access to a paid feature.

## Verify the request, then check the plan

First authenticate the request with the backend SDK so you have a trusted
workspace context (see [Route guards](/auth/securing/route-guards/)).
Once verified, the request carries the workspace identity you can use to check
entitlements before doing paid work.

```ts
// Pseudocode: verify first (see the backend auth guide), then gate.
if (!req.bridgeTenant) return res.status(401).end();

if (!hasEntitlement(req, 'ai_completions')) {
  return res.status(403).json({ error: 'upgrade_required' });
}
// ...run the paid feature
```

## Where the source of truth lives

- **Entitlements & quotas** describe what the plan grants. They are the same
  concepts the frontend uses (see [Lock features to a plan](/billing/limits/lock-features/) and
  [Show usage limits in your app](/billing/limits/usage-limits/)).
- For authoritative, server-side subscription and plan details, call the API:
  [Get subscription state](/api-reference/subscriptions/#get-subscription-state) and
  [Get entitlements](/api-reference/subscriptions/#get-entitlements) in the
  [Subscriptions & Entitlements](/api-reference/subscriptions/) reference.

> Recommended: express paid-feature gates as **feature flags** targeting
> `bridge:billing.*` attributes, so product and ops can adjust access without a
> deploy. See [Target by plan or role](/feature-flags/targeting/by-plan-or-role/).
