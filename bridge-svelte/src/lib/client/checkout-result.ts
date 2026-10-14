// TBP-813 — "a checkout just finished", for whichever page it lands on.
//
// A completed checkout used to stop on a confirmation page (`/subscription/success`)
// before going anywhere. It now lands on `billing.successRoute` (the subscription
// page by default), and this one-shot signal is how that page knows to say so:
// `<BridgeCheckoutNotice>` shows it as a banner, and an app that wants its own
// message reads `checkoutResult`.
//
// In memory only, never in the URL or storage: the checkout return redirects
// inside the running app, so the signal is still here when the landing page
// renders, and a reload (or a later visit) does not show it again. Whoever shows
// it clears it.

import { get, writable, type Readable } from 'svelte/store';

/** What just completed. */
export interface BridgeCheckoutResult {
  /** `checkout`: a paid Stripe checkout returned. `plan`: a plan was set without one (a Free pick). */
  kind: 'checkout' | 'plan';
  /** The plan's name, when the page that set it knew it. Otherwise read the current plan. */
  planName?: string;
}

const result = writable<BridgeCheckoutResult | null>(null);

/** The checkout that just completed, or `null`. Cleared once something shows it. */
export const checkoutResult: Readable<BridgeCheckoutResult | null> = { subscribe: result.subscribe };

/** Record a completed checkout or plan pick. Called by the plugin, not by apps. */
export function markCheckoutComplete(value: BridgeCheckoutResult): void {
  result.set(value);
}

/** Read the result and clear it, so it is shown once. */
export function takeCheckoutResult(): BridgeCheckoutResult | null {
  const value = get(result);
  if (value) result.set(null);
  return value;
}

/** Forget the result without showing it. */
export function clearCheckoutResult(): void {
  result.set(null);
}
