# Your server

`@nebulr-group/bridge-svelte/server` checks the token each call to your API carries, reads flag results for the caller, and counts usage. Import it only from `hooks.server.ts`, `+server.ts` and `+page.server.ts`: it refuses to load in a browser, so your app key never reaches a page.

## Checking tokens

```ts
// src/hooks.server.ts
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { bridgeHandle } from '@nebulr-group/bridge-svelte/server';

export const handle = bridgeHandle({
  issuer: publicEnv.PUBLIC_BRIDGE_ISSUER,
  appKey: env.BRIDGE_APP_KEY, // only for counting usage; keep it on the server
});
```

```ts
// src/app.d.ts
import type { BridgeLocals } from '@nebulr-group/bridge-svelte/server';
declare global {
  namespace App {
    interface Locals { bridge: BridgeLocals }
  }
}
export {};
```

- A request carrying a token (or an `x-api-key`) is checked before any route runs. A bad or ended one is answered 401. While Bridge cannot be checked, the answer is 503, never yes.
- Checks follow your app's revocation list, so a session that ended or a member who was removed is refused within seconds, not when the token expires. Writes (`POST`, `PUT`, `PATCH`, `DELETE`) are checked against a list at most 30 seconds old.
- A request with no credential goes on with `actor: null`.

Call your API from the browser with `bridgeFetch`, which adds the person's token. See [Billing](../billing/billing.md) for what it does with a plan-limit refusal.

## Protecting a route and counting usage

```ts
// src/routes/api/reports/+server.ts
import { json } from '@sveltejs/kit';
import { requireActor, meter, flagsFor } from '@nebulr-group/bridge-svelte/server';

export const POST = async (event) => {
  const actor = requireActor(event);                 // 401 without a signed-in caller
  const flags = await flagsFor(event);
  if (!flags.enabled('reports')) return json({ error: 'off' }, { status: 403 });
  meter(event, 'reports');                           // "count this" for the caller's workspace
  return json({ workspace: actor.workspaceId });
};
```

- `actor` is `{ kind, id, personId, workspaceId, sessionId, appId, standing }`. A workspace whose `standing` is not `active` should only read.
- `meter(event, metric, quantity?)` counts usage. Reports are sent in batches every few seconds and sent again on failure without counting twice. It needs `appKey`.
- `flagsFor(event)` gives the caller's flag results, worked out by Bridge for the person whose token came with the request. A request without one gets every flag's fallback.

`event.locals.bridge.server` is the server client, for anything else.
