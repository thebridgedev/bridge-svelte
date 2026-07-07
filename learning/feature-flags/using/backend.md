# Use flags on your backend

If your backend also evaluates flags for the same user, forward the eval context so both sides agree on identity and bucketing. The SDK serializes the context into the `x-bridge-context` header; backend SDKs (e.g. `@nebulr-group/bridge-nestjs/flags` with `BridgeContextInterceptor`) pick it up automatically.

Only propagate identity and attributes the backend can't derive itself — never `role`/`plan`-style attributes (the backend reads those from its own verified sources).
