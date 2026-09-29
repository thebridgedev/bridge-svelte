# Target by plan or role

This is one of the biggest advantages of building flags on Bridge instead of in isolation: if you're already using Bridge auth and/or Bridge billing, Bridge already knows who's signed in, what role they have, and what their workspace (called a *tenant* in the API) is paying for. You don't invent your own "who is this user" plumbing for targeting; it's already sitting in every evaluation, for every flag, with **no app code**.

Practically, that means an admin can open Control Center (your admin dashboard at app.thebridge.dev) and write a rule like "on for `privileges contains USER_WRITE`" or "on for `bridge:billing.entitlement.analytics eq true`" for any flag, the moment auth or billing is connected. Nothing to send from your code, nothing to redeploy. That is how every gate in app code works: the code asks the flag, the rule says why.

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

## Example: gate a feature by privilege

Turn a flag on only for people who can manage users. No attribute-sending code is needed, since `privileges` is already there:

```ts
const canManageBilling = useFlag('billing_settings', false);
```

The rule, built once in Control Center: *on for users matching `privileges contains "USER_WRITE"`*. Read the app's real roles and privileges first (`bridge role list`): what a role can do is only "in the default setup". Prefer a privilege rule to a role rule (`user.role eq "ADMIN"`); it keeps working when roles are renamed. Use the role only when the role itself is the point.

## Example: gate a feature a plan sells

List the feature on the plans that sell it (`bridge plan feature add pro export_reports`), then gate on a flag:

```ts
const exportReports = useFlag('export_reports', false);
```

Rule: *on for users matching `bridge:billing.entitlement.export_reports eq true`*. The rule never names plans, so it survives plan renames, custom per-workspace grants, and a plan gaining or losing the feature.

## Namespacing

Auth-derived attributes (`user.id`, `user.role`, `user.email`, `tenant.id`, `tenant.plan`, `privileges`) aren't prefixed. Billing-derived attributes are, under `bridge:billing.*`. See [Gate features by role or privilege](/auth/roles/gate-with-flags/) for role/privilege targeting specifically.

## Entitlements (billing)

With billing enabled you also get quota and entitlement attributes (`bridge:billing.quota.<metric>.*`, `bridge:billing.entitlement.<name>`). Gate a plan-sold feature with a flag ruled on its entitlement attribute, never on the plan name (`tenant.plan`, `bridge:billing.plan`); see [Lock features to a plan](/billing/limits/lock-features/) for the pattern.
