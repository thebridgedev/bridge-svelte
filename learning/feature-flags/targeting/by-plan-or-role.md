# Target by plan or role

This is one of the biggest advantages of building flags on Bridge instead of in isolation: if you're already using Bridge auth and/or Bridge billing, Bridge already knows who's signed in, what role they have, and what their workspace (called a *tenant* in the API) is paying for. You don't invent your own "who is this user" plumbing for targeting; it's already sitting in every evaluation, for every flag, with **no app code**.

Practically, that means an admin can open Control Center (your admin dashboard at app.thebridge.dev) and write a rule like "on for `role = ADMIN`" or "on for `tenant.plan = ENTERPRISE`" for any flag, the moment auth or billing is connected. Nothing to send from your code, nothing to redeploy.

## What's available automatically

| Attribute | Source | Example values |
|---|---|---|
| `user.id` | Bridge auth | the signed-in user's ID |
| `user.role` | Bridge auth | `MEMBER`, `ADMIN`, `OWNER` (or your own custom roles) |
| `user.email` | Bridge auth | `jane@acme.com` |
| `tenant.id` | Bridge auth | the current workspace's ID |
| `tenant.plan` | Bridge auth | `FREE`, `PRO`, `ENTERPRISE` |
| `privileges` | Bridge auth | the signed-in user's privilege list |
| `bridge:billing.plan` | Bridge billing | same plan key, sourced from billing directly |
| `bridge:billing.quota.<metric>.*` | Bridge billing | usage/limit for a metered quota |
| `bridge:billing.entitlement.<name>` | Bridge billing | whether the workspace's plan grants a named entitlement |

Your own (dev-supplied) attributes always win on key collision with any of these, and Control Center surfaces the collision on the flag detail page so it's never silently confusing.

## Example: gate a feature by role

Turn a flag on only for admins. No attribute-sending code is needed, since `user.role` is already there:

```ts
const canManageBilling = useFlag('billing_settings', false);
```

The admin builds the rule once in Control Center: *on for users matching `user.role equals ADMIN`*.

## Example: gate a feature by plan

Same pattern for plan-gating a premium feature:

```ts
const exportReports = useFlag('export_reports', false);
```

Rule: *on for users matching `tenant.plan equals ENTERPRISE`*. If you're gating something billing already grants access to, prefer the entitlement pattern below over a raw plan check; it survives plan renames and custom per-workspace grants.

## Namespacing

Auth-derived attributes (`user.id`, `user.role`, `user.email`, `tenant.id`, `tenant.plan`, `privileges`) aren't prefixed. Billing-derived attributes are, under `bridge:billing.*`. See [Gate features by role or privilege](/auth/roles/gate-with-flags/) for role/privilege targeting specifically.

## Entitlements (billing)

With billing enabled you also get quota and entitlement attributes (`bridge:billing.quota.<metric>.*`, `bridge:billing.entitlement.<name>`). The recommended way to gate a plan-granted feature is a flag whose rule targets an entitlement attribute rather than the raw plan name; see [Lock features to a plan](/billing/limits/lock-features/) for the pattern.
