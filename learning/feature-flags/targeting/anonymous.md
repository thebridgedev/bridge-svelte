# Target anonymous visitors

The SDK manages identity for you:

- On first load, it generates an anonymous ID and persists it (configurable: `persistent` localStorage / `session` sessionStorage / `none` in-memory) — anonymous visitors get stable bucketing for A/B tests and percentage rollouts.
- With Bridge auth enabled, the session identity is used automatically and pre-login activity is linked on login.
