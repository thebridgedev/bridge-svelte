# Let users manage their billing

Give users a "Manage billing" entry point to the **Stripe billing portal**, where they can update their payment method, view invoices, or cancel. Bridge exposes the portal as a REST endpoint: `GET /account/subscription/portal` returns a one-time `portalUrl` to redirect to.

The SDK wraps it: `getBridgeAuth().getBillingPortalUrl()` returns the one-time URL. It builds the request from the `apiBaseUrl` you configured and attaches the signed-in user's token and app ID for you, so the same code works on stage and local dev. Call it at click time — the portal session is short-lived, so don't cache the result.

```svelte
<script lang="ts">
  import { getBridgeAuth } from '@nebulr-group/bridge-svelte';

  async function openPortal() {
    window.location.href = await getBridgeAuth().getBillingPortalUrl();
  }
</script>

<button onclick={openPortal}>Manage billing</button>
```

Prefer this over a hand-rolled `fetch`: hardcoding `https://api.thebridge.dev` sends a stage or local app to the production API, where its app ID doesn't exist.

Only the workspace owner may open the portal. `getBridgeAuth().canManageBilling()` returns whether the signed-in user qualifies — use it to hide or disable the button rather than letting the call fail.

See [Subscriptions & Entitlements → Open the billing portal](/api-reference/subscriptions/#open-the-billing-portal) for the endpoint reference.

> **Recovering from a billing problem?** You don't need this button for that. When a workspace (called a *tenant* in the API) is past due, in dunning, or billing-locked, `<BridgeBillingNotice />` already renders a recovery CTA (it sends the user to your billing page, `/billing` by default). Use this "Manage billing" button for the healthy, everyday case. See [Warn about billing problems](/billing/status/billing-notices/).
