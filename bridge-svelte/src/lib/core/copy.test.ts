import { describe, expect, it } from 'vitest';
import { BridgeError } from '@nebulr-group/bridge-auth-core';
import { errorMessage, setAppCopy, translator } from './i18n.js';
import { PLUGIN_EN, PLUGIN_LOCALES } from './messages.js';
import { readPaymentRequired } from './upgrade.js';

describe('the plugin copy', () => {
	it('has every key in all 12 languages, with the same placeholders', () => {
		expect(Object.keys(PLUGIN_LOCALES).sort()).toEqual(['da', 'de', 'en', 'es', 'fi', 'fr', 'it', 'nb', 'nl', 'pl', 'pt', 'sv']);
		const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
		for (const [locale, messages] of Object.entries(PLUGIN_LOCALES)) {
			for (const [key, english] of Object.entries(PLUGIN_EN)) {
				const text = messages[key as keyof typeof PLUGIN_EN];
				expect(text, `${locale} ${key}`).toBeTruthy();
				expect(placeholders(text), `${locale} ${key}`).toBe(placeholders(english));
			}
		}
	});

	it('resolves the app locale, then app overrides, then component overrides', () => {
		setAppCopy('de-AT', { 'login.submit': 'Los', 'session.ended': 'Weg.' });
		const t = translator({ 'session.ended': 'Vorbei.' });
		expect(t('login.submit')).toBe('Los');
		expect(t('session.ended')).toBe('Vorbei.');
		expect(t('workspace.current')).toBe('Aktuell');
		expect(t('password.tooShort', { count: 10 })).toBe('Verwende mindestens 10 Zeichen.');
		setAppCopy(undefined, {});
		expect(translator()('workspace.current')).toBe('Current');
	});

	it('explains an error by its kind, never by guessing', () => {
		const t = translator();
		expect(errorMessage(new BridgeError('wrong-credentials', 'x'), t)).toBe('Invalid email or password.');
		expect(errorMessage(new BridgeError('wrong-device', 'x'), t)).toBe('Open the link on the device you signed up on.');
		expect(errorMessage(new BridgeError('invalid', 'Password is too short.'), t)).toBe('Password is too short.');
		expect(errorMessage(new BridgeError('not-offered', 'x'), t, 'workspace.error.switch')).toBe('Failed to switch workspace.');
		expect(errorMessage(new Error('boom'), t)).toBe('Something went wrong. Please try again.');
	});

	it('says how long to wait when sign-in is paused, and that a locked account needs a reset', () => {
		const t = translator();
		const paused = (retryAfterSeconds: number) =>
			new BridgeError('rate-limited', 'Too many attempts.', { code: 'too_many_attempts', retryAfterSeconds });
		expect(errorMessage(paused(900), t)).toBe('Too many attempts. Try again in 15 minutes.');
		expect(errorMessage(paused(61), t)).toBe('Too many attempts. Try again in 2 minutes.');
		expect(errorMessage(paused(30), t)).toBe('Too many attempts. Try again in 1 minute.');
		expect(errorMessage(new BridgeError('rate-limited', 'x', { code: 'account_locked' }), t)).toBe(
			t('login.error.accountLocked'),
		);
		// No wait time known, or a limit of another kind: the generic message.
		expect(errorMessage(new BridgeError('rate-limited', 'x'), t)).toBe(t('error.rateLimited'));
		expect(errorMessage(new BridgeError('rate-limited', 'x', { code: 'too_many_attempts' }), t)).toBe(t('error.rateLimited'));
	});
});

describe('readPaymentRequired', () => {
	it('opens for a plan limit or a missing plan feature only', () => {
		expect(readPaymentRequired({ code: 'QUOTA_EXCEEDED', metric: 'tickets', used: 3, limit: 3, fix: '/subscription' })).toEqual({
			kind: 'limit',
			metric: 'tickets',
			used: 3,
			limit: 3,
			message: null,
			upgradeHref: '/subscription',
		});
		expect(readPaymentRequired({ type: 'urn:bridge:problem:plan-required', entitlement: 'reports', detail: 'Needs reports.' })).toMatchObject({
			kind: 'feature',
			entitlement: 'reports',
		});
		expect(readPaymentRequired({ code: 'CARD_DECLINED' })).toBeNull();
		expect(readPaymentRequired('nope')).toBeNull();
	});

	it('follows only a same-origin link from the refusal', () => {
		expect(readPaymentRequired({ code: 'QUOTA_EXCEEDED', fix: 'https://evil.test' })?.upgradeHref).toBeNull();
		expect(readPaymentRequired({ code: 'QUOTA_EXCEEDED', fix: '//evil.test' })?.upgradeHref).toBeNull();
		expect(readPaymentRequired({ code: 'QUOTA_EXCEEDED', fix: '/\t/evil.test' })?.upgradeHref).toBeNull();
		expect(readPaymentRequired({ code: 'QUOTA_EXCEEDED', fix: '/\n/evil.test' })?.upgradeHref).toBeNull();
		expect(readPaymentRequired({ code: 'QUOTA_EXCEEDED', fix: '/\\evil.test' })?.upgradeHref).toBeNull();
		expect(readPaymentRequired({ code: 'QUOTA_EXCEEDED', fix: '/subscription?from=exports' })?.upgradeHref).toBe('/subscription?from=exports');
	});
});
