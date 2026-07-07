# Target by plan or role

With Bridge auth and/or billing enabled, attributes like `bridge:user.role`, `bridge:tenant.plan`, and `bridge:billing.plan` merge into every evaluation automatically — no app code. Your own (dev-supplied) attributes always win on key collision, and the admin UI surfaces collisions on the flag detail page.

With billing enabled this includes quota and entitlement attributes (`bridge:billing.quota.<metric>.*`, `bridge:billing.entitlement.<name>`) — the recommended way to gate plan-granted features is a flag whose rule targets an entitlement attribute. See the Payments guide's Entitlements section for the pattern.
