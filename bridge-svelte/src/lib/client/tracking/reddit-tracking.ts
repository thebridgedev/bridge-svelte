/**
 * Reddit / GA4 conversion tracking via GTM dataLayer.
 *
 * Emits standard events (SignUp, Lead, PageVisit, Purchase) with optional
 * advanced-matching (hashed email) and a shared `conversion_id` that pairs
 * with server-side CAPI events for Reddit's deduplication.
 *
 * This util lives in bridge-svelte so it can be consumed uniformly by
 * bridge-cloud-views, bridge-admin-ui, and the marketing site — the hashing
 * rules and dataLayer contract must stay consistent across all three.
 *
 * GTM-side: tags MUST read the `conversion_id` dataLayer variable and forward
 * it to the Reddit Pixel tag as the event dedup key. Same for
 * `user_data.email_address` (advanced matching).
 */

export type RedditConversionEvent = 'SignUp' | 'Lead' | 'PageVisit' | 'Purchase';

export interface RedditUserData {
	/** Pre-hashed (SHA-256 hex of trim+lowercase). Use `sha256Email()` before passing. */
	email_address?: string;
	phone_number?: string;
}

export interface RedditEcommerceItem {
	item_id: string;
	item_name: string;
	item_category?: string;
	price: number;
	quantity: number;
}

export interface RedditEcommerce {
	value: number;
	currency: string;
	items: RedditEcommerceItem[];
}

export interface PushConversionEventOptions {
	user_data?: RedditUserData;
	ecommerce?: RedditEcommerce;
	/**
	 * How the user signed up or logged in. Surfaces as a GA4 custom dimension.
	 * e.g. 'email' | 'passkey' | 'google' | 'linkedin'
	 */
	signup_method?: string;
	/**
	 * UUID shared between this pixel event and the server-side CAPI call.
	 * Reddit dedupes on this value — without it, pixel + CAPI would double-count.
	 */
	conversion_id?: string;
}

declare global {
	interface Window {
		dataLayer?: Record<string, unknown>[];
	}
}

export interface RedditTrackingGate {
	/**
	 * Return true to allow the event, false to suppress. Lets consuming apps
	 * gate on things like "is this the right app?" or "is tracking enabled in env?".
	 * When undefined, all events are pushed (assumes caller handles gating).
	 */
	(): boolean;
}

let _gate: RedditTrackingGate | undefined;

/**
 * Install an app-level gate. Called once at app bootstrap (e.g. from
 * BridgeBootstrap or the app's layout). When the gate returns false, all
 * pushConversionEvent calls no-op.
 */
export function configureRedditTracking(gate: RedditTrackingGate | undefined): void {
	_gate = gate;
}

function getDataLayer(): Record<string, unknown>[] | undefined {
	if (typeof window === 'undefined') return undefined;
	return window.dataLayer;
}

/**
 * Push a conversion event to dataLayer for GTM (Reddit Pixel + GA4).
 *
 * No-ops when not in a browser, dataLayer is missing, or the gate returns false.
 */
export function pushConversionEvent(
	event: RedditConversionEvent,
	options?: PushConversionEventOptions
): void {
	if (_gate && !_gate()) return;

	const dataLayer = getDataLayer();
	if (!dataLayer || !Array.isArray(dataLayer)) return;

	const payload: Record<string, unknown> = { event };

	if (options?.user_data && Object.keys(options.user_data).length > 0) {
		payload.user_data = options.user_data;
	}
	if (options?.ecommerce) {
		// Reddit/GA4 best practice: clear ecommerce before pushing a new one
		dataLayer.push({ ecommerce: null });
		payload.ecommerce = options.ecommerce;
	}
	if (options?.signup_method != null && options.signup_method !== '') {
		payload.signup_method = options.signup_method;
	}
	if (options?.conversion_id != null && options.conversion_id !== '') {
		payload.conversion_id = options.conversion_id;
	}

	dataLayer.push(payload);
}

/** @deprecated Use pushConversionEvent. Kept for backward compatibility. */
export const pushRedditEvent = pushConversionEvent;
