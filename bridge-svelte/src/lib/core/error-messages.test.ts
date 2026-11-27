import { describe, expect, it } from 'vitest';
import { BridgeError } from '@nebulr-group/bridge-auth-core';
import { errorMessage, translator } from './i18n.js';

const t = translator();

describe('named refusals on the forms (TBP-59, TBP-859, TBP-216)', () => {
	it('says what to do about a key without a PIN or fingerprint', () => {
		expect(errorMessage(new BridgeError('invalid', 'x', { code: 'passkey_needs_verification' }), t)).toBe('This key needs a PIN or fingerprint to be used here.');
	});

	it('names who can sign in with Microsoft, and the provider error\'s cause', () => {
		expect(errorMessage(new BridgeError('forbidden', 'x', { code: 'microsoft_account_not_allowed', reason: 'personal' }), t)).toContain('only work or school Microsoft accounts');
		expect(errorMessage(new BridgeError('forbidden', 'x', { code: 'microsoft_account_not_allowed', reason: 'work' }), t)).toContain('only personal Microsoft accounts');
		expect(errorMessage(new BridgeError('unavailable', 'x', { code: 'provider_error', reason: 'admin_approval_needed' }), t)).toContain('IT admin must approve');
		expect(errorMessage(new BridgeError('unavailable', 'x', { code: 'provider_error', reason: 'secret_expired' }), t)).toContain('secret has expired');
		// A cause Bridge does not name: the general message, as before.
		expect(errorMessage(new BridgeError('unavailable', 'x', { code: 'provider_error' }), t)).toBe(t('error.unavailable'));
	});

	it('lists the rules a new password broke, in the checklist\'s words', () => {
		expect(errorMessage(new BridgeError('invalid', 'The password does not meet the app\'s password rules.', { code: 'password_rules', failed: ['minLength', 'blockCommon', 'blockAppName'] }), t)).toBe("Your password needs: Not a common password (checked when you save), Not the app's name (checked when you save).");
		expect(errorMessage(new BridgeError('invalid', 'Too short.', { code: 'password_rules', failed: ['minLength'] }), t)).toBe('Too short.');
	});
});
