# API tokens

Bridge lets you offer your own users a self-service way to create API tokens for programmatic access to your API — the same idea as a GitHub or Stripe personal access token, without you having to build token issuance, storage, or revocation yourself.

## Use cases

- **CI/CD and scripts** — a user wires a token into a pipeline or cron job to call your API unattended.
- **Personal automation** — a power user scripts against your API for their own workflows (exports, syncs, bulk edits).
- **Third-party integrations** — a user hands a token to a tool they use (a BI dashboard, a Zapier-style integration) so it can read or write on their behalf without sharing their password.

None of these need a real login session — that's exactly the gap API tokens fill.

## How it works

- **Privilege-scoped** — a token is created with an explicit set of privileges (the same privilege keys your [roles](/auth/roles/how-it-works/) use), picked from a searchable list. It can never do more than what it's granted.
- **Workspace-scoped** — a token is bound to the tenant it was created in and can't be replayed against another one.
- **Hash-at-rest, shown once** — Bridge stores only a salted hash. The full token value is shown exactly once, right after creation — if it's lost, the user revokes it and issues a new one.
- **Revocation is immediate** — any caller still presenting a revoked token gets a `401` on its very next request.

## Using a token from a server

Send it as a bearer credential:

```ts
const res = await fetch('https://api.example.com/work', {
  headers: { Authorization: `Bearer ${process.env.BRIDGE_API_TOKEN}` },
});
```

Backend SDKs (e.g. `@nebulr-group/bridge-nestjs`) validate the token, resolve its workspace and privileges, and expose them to your guards — no extra round-trip.

## Letting your users manage their own tokens

A drop-in component handles the whole self-service flow — listing, creating, revoking — so you don't have to build a token management screen yourself. See [Tokens](/auth/ui/tokens/) in UI components.
