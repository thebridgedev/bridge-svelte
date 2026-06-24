---
title: API Tokens
order: 55
oneLiner: Issue scoped, programmatic access tokens — created, shown once, and revocable.
related: [team-management, multi-tenancy]
---

# API Token Management

API tokens give scripts, CI, and backend services programmatic access to your workspace without a user session. Each token carries an explicit set of **privileges** (scopes) and is bound to the workspace it was created in, so a leaked token can never reach beyond its grant.

### ApiTokenManagement

A drop-in component for managing API tokens. Renders a complete token management UI.

**Usage:**

```svelte
<!-- src/routes/settings/api-tokens/+page.svelte -->
<script lang="ts">
  import { ApiTokenManagement } from '@nebulr-group/bridge-svelte';
</script>

<ApiTokenManagement class="my-token-panel" />
```

The component provides:
- List of existing API tokens
- Create new tokens with a privilege picker (searchable)
- Revoke tokens with confirmation
- Display a new token value once after creation (show/hide/copy)
- Token expiry date display

No additional props are required. Standard `HTMLAttributes<HTMLDivElement>` props (`class`, `style`, etc.) are forwarded to the root element.

### Scopes & the one-time secret

When you create a token you choose its **privileges** from the searchable picker — the same privilege keys your roles use. A token can never do more than the privileges you grant it.

The full token value is shown **exactly once**, immediately after creation. Bridge stores only a hash, so it can never display the secret again — copy it into your secret manager before dismissing the dialog. If it's lost, revoke it and issue a new one.

### Using a token from a server

Send the token as a bearer credential on the `Authorization` header:

```ts
const res = await fetch('https://api.example.com/work', {
  headers: { Authorization: `Bearer ${process.env.BRIDGE_API_TOKEN}` },
});
```

Backend SDKs (e.g. `@nebulr-group/bridge-nestjs`) validate the token, resolve its workspace + privileges, and expose them to your guards — no extra round-trip.

### Revoking

Revoking a token takes effect immediately and is irreversible. Any caller still presenting it gets a `401`. Revoke generously: tokens are cheap to reissue, and a stale grant is the most common way access leaks.

### Under the hood

- **Hash-at-rest** — only a salted hash of the token is stored; the plaintext exists solely in the show-once dialog.
- **Workspace-scoped** — a token resolves to the workspace it was minted in; it can't be replayed against another tenant.
- **Privilege-checked per request** — the backend re-evaluates the token's privileges on every call, so revoking a privilege from the role narrows existing tokens too.
