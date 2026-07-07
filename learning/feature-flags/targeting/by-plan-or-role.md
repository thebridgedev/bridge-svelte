# Target by plan or role

With Bridge auth and/or billing enabled, attributes like `user.role`, `tenant.plan`, and `bridge:billing.plan` merge into every evaluation automatically — no app code. Your own (dev-supplied) attributes always win on key collision, and the admin UI surfaces collisions on the flag detail page.

Note the difference in namespacing: auth-derived attributes (`user.role`, `user.email`, `tenant.id`, `tenant.plan`, `privileges`) aren't prefixed, while billing-derived attributes are, under `bridge:billing.*` — see [Gate features by role or privilege](/auth/roles/gate-with-flags/) for role/privilege targeting specifically.

With billing enabled this includes quota and entitlement attributes (`bridge:billing.quota.<metric>.*`, `bridge:billing.entitlement.<name>`) — the recommended way to gate plan-granted features is a flag whose rule targets an entitlement attribute. See the Payments guide's Entitlements section for the pattern.
