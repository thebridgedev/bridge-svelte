# Target anonymous visitors

An anonymous visitor is anyone using your app without being signed in: a
marketing-page reader, a trial user before signup, or any app that doesn't use
Bridge auth at all. Flags still work for them, including percentage rollouts
and A/B tests, because the SDK manages identity for you.

## The anonymous ID

On first load, the SDK generates an anonymous ID (a UUID prefixed `anon_`) and
persists it in the browser, so the same visitor presents the same identity on
every page view and every return visit. With Bridge auth enabled, the
signed-in identity takes over automatically, and the SDK reports the previous
anonymous ID alongside the user ID so pre-login activity can be linked to the
signed-in user.

## Stable bucketing

Percentage rollouts need to answer "is *this* visitor in the 10%?" the same
way every time. That's what stable bucketing means: the SDK hashes the flag
key together with the visitor's identity into a bucket number from 0 to 99,
and a rule with a rollout percentage passes when the bucket falls below it.
Because the hash inputs never change for a given visitor and flag, the same
visitor always lands in the same bucket:

- No flicker: a visitor doesn't flip between the old and new experience across
  page loads or sessions.
- Sticky ramps: a visitor who's in at 10% stays in as you ramp to 25%, 50%,
  100%. Nobody gets re-rolled.
- Consistent everywhere: the same hash runs on the server and in the SDK, so
  both sides agree when you [propagate context to your backend](/feature-flags/using/backend/).

## Where persistence is configured

By default the anonymous ID is stored in `localStorage` under the key
`bridge.anon_id`, so it survives across sessions. If you need different
behavior, the advanced `createBridgeFlags` API accepts an `identity` option:

- `tracking: 'persistent'`: `localStorage`, survives across sessions (the default)
- `tracking: 'session'`: `sessionStorage`, one browser tab/session
- `tracking: 'none'`: in-memory only, forgotten on reload
- `storage`: your own `IdentityStorage` implementation (e.g. cookie-backed)
- `storageKey`: a different storage key than `bridge.anon_id`

Most apps never touch this; the default `<BridgeBootstrap />` wiring uses
persistent tracking.

## Example: roll out to 20% of visitors

Create a flag `new_landing` in Control Center (your admin dashboard at
app.thebridge.dev) and give it a rule with a rollout percentage of 20 and no
attribute conditions. Then read it like any other flag:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const landing = useFlag('new_landing', false);
</script>

{#if landing.value}<NewLanding />{:else}<OldLanding />{/if}
```

Every visitor, signed in or not, gets bucketed by their stable identity:
roughly 20% see the new page, and each individual visitor keeps seeing the
same version. Ramping to 50% or 100% later is a Control Center edit, not a
deploy.

A rollout can also sit behind attribute conditions (say, 20% *of visitors
whose `locale = sv`*), because the percentage applies after the rule's
conditions match. And a multi-variant flag (string/number/JSON) splits traffic
into experiment arms with the same stickiness, which is how you run A/B tests
on visitors who have never signed in.
