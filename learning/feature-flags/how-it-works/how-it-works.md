# How flags work

Bridge Feature Flags **evaluates locally**. The SDK keeps your flag rules in
memory, evaluates them against in-process context, and receives rule changes
live over a push channel. A flag check is an O(1) lookup — no network call — so
it's safe to call directly in render paths.

## The evaluation model

- **No network on read.** `useFlag` / `<FeatureFlag>` evaluate against an
  in-memory rule cache; there's no request per flag check.
- **Live rule updates** arrive over the realtime channel as `flag.updated` /
  `flag.removed` messages and update values in place — no refresh, no flicker.
  So flipping a flag, ramping a rollout, or hitting a kill switch is an admin
  action; your deployed code never changes.
- **Telemetry** (which flags evaluated to what) is batched and reported in the
  background, off the render path.

## It stays up through outages

When the live channel drops, flags **freeze on their last-known values** and
refetch on reconnect, so your app keeps working through Bridge outages.

```ts
import { realtimeStatus } from '@nebulr-group/bridge-svelte/flags';
// reactive ConnectionState: 'connecting' | 'open' | 'closed' …
```

## Flags work standalone

An `appId` is all the configuration flags need — you don't need Bridge auth or
billing. When those *are* enabled, they become automatic context sources you can
target on (see [Target by plan or role](/feature-flags/targeting/by-plan-or-role/)).

Next: [Get started](/feature-flags/get-started/).
