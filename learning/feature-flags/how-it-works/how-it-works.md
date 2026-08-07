# How flags work

A feature flag is a switch on a piece of behavior in your app that you control
from Control Center (your admin dashboard at app.thebridge.dev) instead of from
a deploy. Wrap something in a flag and you can:

- **Ship dark**: merge and deploy a feature while it's still off for everyone,
  then turn it on when it's ready.
- **Roll out gradually**: turn it on for 10% of users, watch, then ramp to
  25%, 50%, 100%.
- **Target a segment** (an audience defined by attribute rules): turn it on
  only for a role, a plan, an internal group, or any attribute your app sends.
- **Kill it instantly**: something's wrong in production? Flip the flag off and
  it works as a kill switch. No rollback, no redeploy.

Every one of those is an action you take in Control Center. Flip a flag there
and it reaches every connected app live, typically within seconds. No refresh,
no redeploy. That's possible because of how flags evaluate:

Bridge Feature Flags **evaluates locally**. The SDK keeps your flag rules in
memory, evaluates them against in-process context, and receives rule changes
over the live channel (a persistent realtime connection the SDK maintains). A
flag check is an O(1) lookup with no network call, so it's safe to call
directly in render paths.

## The evaluation model

- **No network on read.** `useFlag` / `<FeatureFlag>` evaluate against an
  in-memory rule cache; there's no request per flag check.
- **Live rule updates** arrive over the live channel as `flag.updated` /
  `flag.removed` messages and update values in place, with no refresh and no
  flicker. So flipping a flag, ramping a rollout, or hitting a kill switch is
  a Control Center action; your deployed code never changes.
- **Telemetry** (which flags evaluated to what) is batched and reported in the
  background, off the render path.

## It stays up through outages

When the live channel drops, flags **freeze on their last-known values** and
refetch on reconnect, so your app keeps working through Bridge outages.

You can observe the connection yourself: `realtimeStatus` is a Svelte readable
store of the current `ConnectionState`, which is one of `'idle'`,
`'connecting'`, `'open'`, or `'closed'`. Subscribe to it in a component with
the `$` prefix:

```svelte
<script lang="ts">
  import { realtimeStatus } from '@nebulr-group/bridge-svelte/flags';
</script>

{#if $realtimeStatus === 'closed'}
  <div class="banner">Offline: flag values are frozen until we reconnect.</div>
{/if}
```

## Flags work standalone

An `appId` is all the configuration flags need; you don't need Bridge auth or
billing. When those *are* enabled, they become automatic context sources you can
target on (see [Target by plan or role](/feature-flags/targeting/by-plan-or-role/)).

Next: [Get started](/feature-flags/get-started/).
