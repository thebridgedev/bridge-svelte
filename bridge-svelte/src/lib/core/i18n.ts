/**
 * The translator every component uses: the shared catalogue from auth-core,
 * the plugin's own keys, the app's `messages` from bridgeBootstrap, and a
 * component's own `messages` prop, in that order of precedence (last wins).
 */
import {
	checkoutSetupProblem,
	createTranslator,
	interpolate,
	isBridgeError,
	normalizeLocale,
	waitMinutes,
	type BridgeError,
	type MessageKey,
} from '@nebulr-group/bridge-auth-core';
import type { BridgeMessages } from './config.js';
import { PLUGIN_EN, PLUGIN_LOCALES, type PluginMessageKey } from './messages.js';
import { providerName } from './providers.js';

export type BridgeMessageKey = MessageKey | PluginMessageKey;

export interface BridgeTranslator {
	(key: BridgeMessageKey, vars?: Record<string, string | number>): string;
}

let appLocale: string | undefined;
let userLocale: string | undefined;
let appMessages: BridgeMessages = {};

/**
 * The signed-in person's own language, from their profile: it applies where the app set no language of its own
 * (the screen's language comes first, then the person's, then English). `<MyProfile>` sets it.
 */
export function setUserLocale(locale: string | null | undefined): void {
	userLocale = locale ?? undefined;
}

/** Set by bridgeBootstrap: the app's language and wording, once for every component. */
export function setAppCopy(locale: string | undefined, messages: BridgeMessages): void {
	appLocale = locale;
	appMessages = messages;
}

function isPluginKey(key: string): key is PluginMessageKey {
	return key in PLUGIN_EN;
}

/**
 * A translator for one component, with its own `messages` on top of the app's. `locale`, when given, is the
 * language this component shows in, whatever the app's: `<MyProfile>` shows a newly chosen language at once.
 */
export function translator(messages?: BridgeMessages, locale?: string | null): BridgeTranslator {
	const overrides: BridgeMessages = { ...appMessages, ...messages };
	const language = locale ?? appLocale ?? userLocale;
	const shared = createTranslator({ locale: language, messages: overrides });
	const plugin = PLUGIN_LOCALES[language ? normalizeLocale(language) : 'en'] ?? PLUGIN_EN;
	return (key, vars) => {
		if (!isPluginKey(key)) return shared(key, vars);
		const override = (overrides as Record<string, string | undefined>)[key];
		return interpolate(override ?? plugin[key] ?? PLUGIN_EN[key], vars);
	};
}

const reportedOrigins = new Set<string>();
const reportedCheckout = new Set<string>();

/**
 * What a screen shows when a Bridge call fails, from the error's kind. A
 * kind with no message of its own shows `fallback`. Bridge never says
 * whether an email has an account, so neither does this.
 */
export function errorMessage(error: unknown, t: BridgeTranslator, fallback: BridgeMessageKey = 'error.generic'): string {
	if (!isBridgeError(error)) return t(fallback);
	const e = error as BridgeError;
	// A checkout that cannot start because of how the app is set up: the payer is told plainly, the developer exactly
	// (the same words are in the app's log in Bridge's dashboard).
	if (checkoutSetupProblem(e) !== null) {
		const origin = typeof location === 'undefined' ? '' : location.origin;
		const once = `${e.code ?? ''}|${origin}`;
		if (!reportedCheckout.has(once)) {
			reportedCheckout.add(once);
			console.error(`[bridge] The checkout could not start. ${e.message}`);
		}
		return t('billing.error.checkout');
	}
	switch (e.kind) {
		case 'wrong-credentials':
			return t('login.error.invalidCredentials');
		case 'wrong-device':
			return t('verify.error.wrongDevice');
		case 'link-invalid':
			return t('link.error.invalid');
		case 'flow-expired':
			return t('login.error.flowExpired');
		case 'unsupported-step':
			return t('login.error.unsupportedStep');
		case 'unavailable':
			return t('error.unavailable');
		case 'network':
			return t('error.network');
		case 'rate-limited': {
			// A locked account has no time to wait: the owner resets the password.
			if (e.code === 'account_locked') return t('login.error.accountLocked');
			const minutes = e.code === 'too_many_attempts' ? waitMinutes(e) : null;
			if (minutes === null) return t('error.rateLimited');
			return minutes === 1 ? t('login.error.tooManyAttemptsOneMinute') : t('login.error.tooManyAttempts', { minutes });
		}
		// Login security: who suspended and why is only for the app's admins; the screen shows the support contact.
		case 'suspended':
			return t('login.error.suspended');
		case 'domain-blocked':
			return t('signup.error.domainBlocked');
		case 'permanent-email-required':
			return t('signup.error.permanentEmail');
		case 'bot-check-failed':
			return t('signup.error.botCheck');
		case 'password-leaked':
			return t(e.leakedPasswords === 'warn' ? 'password.leaked.warn' : 'password.leaked.refuse');
		case 'password-change-required':
			return t('login.leaked.refuse');
		// An address Google or a company's sign-in manages: it is changed there.
		case 'managed-by-provider':
			return t('profile.email.managedHint', { provider: providerName(e.provider) });
		case 'signed-out':
		case 'reauthenticate':
			return t('session.ended');
		case 'origin-not-allowed': {
			const origin = typeof location === 'undefined' ? "this page's origin" : location.origin;
			if (!reportedOrigins.has(origin)) {
				reportedOrigins.add(origin);
				console.error(
					`[bridge] Bridge refused this page's origin, ${origin}. Add it to the app's browser addresses in Bridge.`,
				);
			}
			return t('error.originNotAllowed', { origin });
		}
		case 'invalid':
		case 'conflict':
		case 'forbidden':
		case 'not-found':
		case 'plan-required':
			// Bridge's own reason, such as a password that is too short or a seat limit.
			return e.message !== '' ? e.message : t(fallback);
		default:
			return t(fallback);
	}
}
