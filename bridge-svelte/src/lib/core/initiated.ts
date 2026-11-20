import { initiatedSignIn } from '@nebulr-group/bridge-auth-core';

/**
 * What the callback page does with a sign-in Bridge's hosted page asked the app to start (the page was opened with no
 * sign-in request, and sent the browser to the app's default return with `iss`): in hosted mode, start the app's own
 * hosted sign-in, on the sign-up form with the plan for a signup link; otherwise go to the app's own sign-in or sign-up
 * page. Null for any other address, another issuer's among them: the callback finishes a return as before.
 */
export type InitiatedStep =
	| { readonly kind: 'start'; readonly page: 'sign-in' | 'sign-up'; readonly plan: string | null; readonly price: { readonly currency: string; readonly interval: string } | null }
	| { readonly kind: 'own-page'; readonly to: string };

export function initiatedStep(location: string, config: { readonly issuer: string; readonly authBase: string; readonly hosted: unknown }): InitiatedStep | null {
	const asked = initiatedSignIn(location, config.issuer);
	if (asked === null) return null;
	if (config.hosted) return { kind: 'start', page: asked.page, plan: asked.plan, price: asked.price };
	const to = `${config.authBase}/${asked.page}`;
	if (asked.page !== 'sign-up' || asked.plan === null) return { kind: 'own-page', to };
	const query = new URLSearchParams({ signupPlan: asked.plan, ...(asked.price === null ? {} : { signupCurrency: asked.price.currency, signupRecurrenceInterval: asked.price.interval }) });
	return { kind: 'own-page', to: `${to}?${query.toString()}` };
}
