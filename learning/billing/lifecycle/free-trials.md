# Offer free trials

A plan can include a trial. While a workspace (called a *tenant* in the API)
is trialing, its subscription `status` is `"trial"` and `endsAt` holds the
trial end date, both live on the `bridge` object (see
[How billing works](/billing/how-it-works/)).

## Surfacing trial state

The drop-in components already understand trials: `<BridgeSubscriptionStatus />`
shows the trialing status and `<BridgeBillingNotice />` surfaces an
end-of-trial prompt as the date approaches. You can also read it yourself.
Note that `endsAt` is optional on the snapshot, so guard it before formatting:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const subscription = bridge.tenant.subscription;
</script>

{#if $subscription?.status === 'trial'}
  {#if $subscription.endsAt}
    <p>Trial ends {new Date($subscription.endsAt).toLocaleDateString()}</p>
  {:else}
    <p>Trial active</p>
  {/if}
{/if}
```

## Reacting to the trial lifecycle

For side effects (emails, analytics, nudges), handle the trial events on the
unified dispatcher; see [React to billing changes](/billing/lifecycle/billing-events/):

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.events.handle({
  'subscription.trial_started':      (m) => analytics.track('trial_started', m),
  'subscription.trial_ending_soon':  (m) => sendReminder(m),
  'subscription.trial_converted':    (m) => analytics.track('trial_converted', m),
  'subscription.trial_expired':      (m) => analytics.track('trial_expired', m),
});
```

When a trial expires without converting, the workspace becomes **billing-locked**:
the server sets `gateEngaged: true` on the subscription snapshot, the same lock
mechanism described in [How billing works](/billing/how-it-works/#when-billing-locks-the-app).
Gate your app with [Require a plan](/billing/onboarding/require-plan/) so the
workspace can pick a paid plan and get back in.
