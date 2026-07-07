# Getting the token

Bridge keeps the current token set in the `auth.token` store, which always holds
a valid token. Bridge refreshes it automatically before it expires — see
[How the token is renewed](./token-renewal.md) — so you never manage token
lifetimes yourself.
