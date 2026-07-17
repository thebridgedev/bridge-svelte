# API tokens

Bridge lets you offer your own users a self-service way to create API tokens for programmatic access to your API: the same idea as a GitHub or Stripe personal access token, without you having to build token issuance, storage, or revocation yourself.

## Use cases

- **CI/CD and scripts**: a user wires a token into a pipeline or cron job to call your API unattended.
- **Personal automation**: a power user scripts against your API for their own workflows (exports, syncs, bulk edits).
- **Third-party integrations**: a user hands a token to a tool they use (a BI dashboard, a Zapier-style integration) so it can read or write on their behalf without sharing their password.

None of these need a real login session; that's exactly the gap API tokens fill.

## How it works

- **Privilege-scoped**: a token is created with an explicit set of privileges (the same privilege keys your [roles](/auth/roles/how-it-works/) use), picked from a searchable list. It can never do more than what it's granted.
- **Privilege-checked per request**: the backend re-evaluates the token's privileges on every call, so revoking a privilege from a role narrows existing tokens too.
- **Workspace-scoped**: a token is bound to the workspace it was created in (a workspace is called a *tenant* in the API) and can't be replayed against another one.
- **Hash-at-rest, shown once**: Bridge stores only a salted hash. The full token value is shown exactly once, right after creation; copy it straight into your secret manager, because Bridge can never display it again. If it's lost, revoke it and issue a new one.
- **Revocation**: backend SDKs verify API tokens by asking Bridge (introspection) rather than checking a local signature, and by default they do this on every request, so a revoked token is rejected on its very next call. If your backend enables introspection-result caching, rejection can lag by up to that cache's TTL.

## Using a token from a server

Send it as a bearer credential:

```ts
const res = await fetch('https://api.example.com/work', {
  headers: { Authorization: `Bearer ${process.env.BRIDGE_API_TOKEN}` },
});
```

Backend SDKs (e.g. `@nebulr-group/bridge-nestjs`) validate the token, resolve its workspace and privileges, and expose them to your guards with no extra round-trip on your part.

## Revoke generously

Revoking a token is irreversible, but tokens are cheap to reissue, and a stale grant is a common way access leaks. When in doubt, revoke and mint a fresh one.

## Letting your users manage their own tokens

A drop-in component handles the whole self-service flow (listing, creating, revoking) so you don't have to build a token management screen yourself. See [Tokens](/auth/ui/tokens/) in UI components.
