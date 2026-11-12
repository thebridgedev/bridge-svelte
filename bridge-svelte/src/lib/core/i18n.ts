/**
 * The translator every component uses: the shared catalogue from auth-core,
 * the plugin's own keys, the app's `messages` from bridgeBootstrap, and a
 * component's own `messages` prop, in that order of precedence (last wins).
 */
import {
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

export type BridgeMessageKey = MessageKey | PluginMessageKey;

export interface BridgeTranslator {
	(key: BridgeMessageKey, vars?: Record<string, string | number>): string;
}

let appLocale: string | undefined;
let appMessages: BridgeMessages = {};

/** Set by bridgeBootstrap: the app's language and wording, once for every component. */
export function setAppCopy(locale: string | undefined, messages: BridgeMessages): void {
	appLocale = locale;
	appMessages = messages;
}

function isPluginKey(key: string): key is PluginMessageKey {
	return key in PLUGIN_EN;
}

/** A translator for one component, with its own `messages` on top of the app's. */
export function translator(messages?: BridgeMessages): BridgeTranslator {
	const overrides: BridgeMessages = { ...appMessages, ...messages };
	const shared = createTranslator({ locale: appLocale, messages: overrides });
	const plugin = PLUGIN_LOCALES[appLocale ? normalizeLocale(appLocale) : 'en'] ?? PLUGIN_EN;
	return (key, vars) => {
		if (!isPluginKey(key)) return shared(key, vars);
		const override = (overrides as Record<string, string | undefined>)[key];
		return interpolate(override ?? plugin[key] ?? PLUGIN_EN[key], vars);
	};
}

const reportedOrigins = new Set<string>();

/**
 * What a screen shows when a Bridge call fails, from the error's kind. A
 * kind with no message of its own shows `fallback`. Bridge never says
 * whether an email has an account, so neither does this.
 */
export function errorMessage(error: unknown, t: BridgeTranslator, fallback: BridgeMessageKey = 'error.generic'): string {
	if (!isBridgeError(error)) return t(fallback);
	const e = error as BridgeError;
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
