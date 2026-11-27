import { describe, expect, it } from 'vitest';
import { BridgeError, type SignInStep } from '@nebulr-group/bridge-auth-core';
import { render } from 'svelte/server';
import { codeDigits, countdown, recoveryCodesText } from '../../core/code-input.js';
import { codeErrorMessage, codeSpent } from '../../core/code-errors.js';
import { errorMessage, translator } from '../../core/i18n.js';
import { encodeQr, qrPath } from '../../core/qr.js';
import CodeInput from '../shared/CodeInput.svelte';
import QrCode from '../shared/QrCode.svelte';
import RecoveryCodes from '../shared/RecoveryCodes.svelte';
import SecondStepForm from './SecondStepForm.svelte';
import EmailCodeScreen from './EmailCodeScreen.svelte';

/** Email codes, the second step's ways, the QR code, recovery codes and the Security settings. */

const files = import.meta.glob('./*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const source = (name: string) => files[`./${name}.svelte`] as string;
const t = translator();

describe('the code field', () => {
	it('keeps the digits of what is typed or pasted, six at most', () => {
		expect(codeDigits('123 456')).toBe('123456');
		expect(codeDigits('Your code: 12-34-56 (valid 10 min)')).toBe('123456');
		expect(codeDigits('12a')).toBe('12');
	});

	it('is one numeric field with the one-time-code hint and its label, drawn as six boxes', () => {
		const html = render(CodeInput, { props: { value: '12', label: 'Code from the email', id: 'c1' } }).body;
		expect(html).toContain('inputmode="numeric"');
		expect(html).toContain('autocomplete="one-time-code"');
		expect(html).toContain('maxlength="6"');
		expect(html).toMatch(/<label for="c1">Code from the email<\/label>/);
		expect(html.match(/class="bridge-code-slot[ "]/g)).toHaveLength(6);
		expect(html.match(/<input/g)).toHaveLength(1);
		expect(html).toMatch(/class="bridge-code-slots[^"]*" aria-hidden="true"/);
	});

	it('counts down the wait for a new code as m:ss', () => {
		expect(countdown(60)).toBe('1:00');
		expect(countdown(42.2)).toBe('0:43');
		expect(countdown(-3)).toBe('0:00');
	});
});

describe('a refused code says why', () => {
	it('wrong with the tries left, expired, too soon, a wrong recovery code', () => {
		const wrong = (left: number) => new BridgeError('invalid', 'x', { code: 'wrong_code', triesLeft: left });
		expect(codeErrorMessage(wrong(3), t)).toBe('Wrong code, 3 tries left.');
		expect(codeErrorMessage(wrong(1), t)).toBe('Wrong code, 1 try left.');
		expect(codeErrorMessage(wrong(0), t)).toBe('This code has expired. Send a new code.');
		expect(codeSpent(wrong(0))).toBe(true);
		expect(codeErrorMessage(new BridgeError('invalid', 'x', { code: 'code_expired' }), t)).toBe('This code has expired. Send a new code.');
		expect(codeErrorMessage(new BridgeError('rate-limited', 'x', { code: 'too_soon', retryAfterSeconds: 42 }), t)).toBe('Wait 42 seconds before asking for a new code.');
		expect(codeErrorMessage(new BridgeError('invalid', 'x', { code: 'wrong_recovery_code' }), t)).toBe('That recovery code is not right, or it was used already.');
		expect(codeErrorMessage(new BridgeError('wrong-device', 'x'), t)).toBe(t('verify.error.wrongDevice'));
	});

	it('an expired password says so, rules that changed keep their own message', () => {
		expect(errorMessage(new BridgeError('forbidden', 'x', { code: 'password_change_required', reason: 'expired' }), t)).toBe("Your password has expired. We've sent you a link to choose a new one.");
		expect(errorMessage(new BridgeError('forbidden', 'x', { code: 'password_change_required' }), t)).toBe(t('login.passwordChange'));
	});

	it('the code screen shows the masked address, the wait and "Wrong email?"', () => {
		const html = render(EmailCodeScreen, { props: { email: 'a…@acme.com', verify: async () => undefined, resend: async () => 60, onBack: () => undefined } }).body;
		expect(html).toContain('We sent a 6-digit code to a…@acme.com.');
		expect(html).toContain('Wrong email?');
		expect(html).toContain('autocomplete="one-time-code"');
	});
});

describe('the QR code, drawn in the page', () => {
	it('matches a reference encoder module for module (byte mode, level M, mask 2)', () => {
		const reference = ["111111100111101111111", "100000100110101000001", "101110101101101011101", "101110101100101011101", "101110101001101011101", "100000101100101000001", "111111101010101111111", "000000001011100000000", "101111100000101111100", "011101010010100100001", "001100110101010011110", "111010000100000110100", "111010100001010010101", "000000001001111001001", "111111100010101100010", "100000101111111001001", "101110101000100100100", "101110101110100100100", "101110101001010011100", "100000100110000110100", "111111101011010011110"] as string[];
		const code = encodeQr('hi', 'M', { mask: 2 });
		expect(code.version).toBe(1);
		expect(code.modules.map((row) => row.map((on) => (on ? '1' : '0')).join(''))).toEqual(reference);
	});

	it('fits an authenticator address in a small version, and draws an SVG path with a quiet zone', () => {
		const code = encodeQr('otpauth://totp/Acme:alice%40acme.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme');
		expect(code.version).toBe(5);
		expect(code.size).toBe(37);
		const drawn = qrPath(code);
		expect(drawn.viewBox).toBe('0 0 45 45');
		expect(drawn.path.startsWith('M4 4h1v1h-1z')).toBe(true);
		expect(() => encodeQr('x'.repeat(3000))).toThrow(RangeError);
		const svg = render(QrCode, { props: { value: 'otpauth://totp/x?secret=A', label: 'QR code for your authenticator app' } }).body;
		expect(svg).toMatch(/role="img" aria-label="QR code for your authenticator app"/);
	});
});

describe('the second step', () => {
	const step = (extra: Partial<Extract<SignInStep, { next: 'second_step' }>> = {}): Extract<SignInStep, { next: 'second_step' }> => ({
		done: false,
		next: 'second_step',
		method: 'totp',
		methods: ['totp', 'email'],
		phone: '',
		sent: true,
		rememberDays: 30,
		recovery: true,
		verify: async () => ({ done: true }),
		useRecoveryCode: async () => ({ done: true }),
		chooseMethod: async () => ({ done: true }),
		resend: async () => ({ done: true }),
		reset: async () => ({ done: true }),
		...extra,
	});

	it('asks for the authenticator app\'s code, offers another way and remembering the device', () => {
		const html = render(SecondStepForm, { props: { step: step(), onStep: () => undefined } }).body;
		expect(html).toContain('data-bridge-second-step-method="totp"');
		expect(html).toContain(t('secondStep.totpIntro'));
		expect(html).toContain('Use another way');
		expect(html).toContain('Remember this device for 30 days');
		// An authenticator app makes its own codes: no "Send a new code".
		expect(html).not.toContain('data-bridge-second-step-resend');
	});

	it('an email code says where it went, and why when texts were not available', () => {
		const html = render(SecondStepForm, { props: { step: step({ method: 'email', email: 'a…@acme.com', note: 'texts_unavailable', rememberDays: 0 }), onStep: () => undefined } }).body;
		expect(html).toContain('We sent a code to a…@acme.com.');
		expect(html).toContain(t('secondStep.textsUnavailable'));
		expect(html).toContain('data-bridge-second-step-resend');
		expect(html).not.toContain('Remember this device');
	});

	it('setting up an authenticator app shows the QR code and the key to type', () => {
		const html = render(SecondStepForm, { props: { step: step({ setup: { secret: 'JBSW Y3DP', uri: 'otpauth://totp/Fake:a?secret=JBSWY3DP' } }), onStep: () => undefined } }).body;
		expect(html).toContain('data-bridge-qr');
		expect(html).toContain('JBSW Y3DP');
		expect(html).toContain('Scan the QR code');
	});

	it('the first time, an authenticator app is offered first, with text messages beside it', () => {
		const setup: Extract<SignInStep, { next: 'second_step_setup' }> = { done: false, next: 'second_step_setup', methods: ['totp', 'sms'], setUp: async () => ({ done: true }), setUpTotp: async () => ({ done: true }) };
		const html = render(SecondStepForm, { props: { step: setup, onStep: () => undefined } }).body;
		expect(html).toContain('data-bridge-second-step-setup="totp"');
		expect(html).toContain('data-bridge-second-step-setup="sms"');
		expect(html).toContain(t('secondStep.chooseSetupIntro'));
	});

	it('an older Bridge\'s text message keeps the backup code', () => {
		const html = render(SecondStepForm, { props: { step: step({ method: 'sms', methods: ['sms'], phone: '+46 •••• 67', rememberDays: 0 }), onStep: () => undefined } }).body;
		expect(html).toContain('data-bridge-second-step-backup');
		expect(html).not.toContain('data-bridge-second-step-another');
	});

	it('recovery codes are shown once, with copy, download and print, and Continue waits for "I\'ve saved these"', () => {
		const html = render(RecoveryCodes, { props: { codes: ['AAAA-1111', 'BBBB-2222'], t, onDone: () => undefined } }).body;
		expect(html).toContain('AAAA-1111');
		for (const action of ['copy', 'download', 'print']) expect(html).toContain(`data-bridge-recovery-${action}`);
		expect(html).toMatch(/data-bridge-recovery-continue[^>]*disabled/);
		expect(recoveryCodesText(['A', 'B'], 'Codes')).toBe('Codes\n\nA\nB\n');
		const form = source('SecondStepForm');
		expect(form).toContain('next.recoveryCodes');
		expect(form).toContain('chooseMethod(');
		expect(form).toContain('useRecoveryCode(');
	});
});

describe('the forms on an app set to codes', () => {
	it('sign-in offers "Email me a code" on a code app and keeps the link on a link app', () => {
		const form = source('SignInForm');
		expect(form).toContain("emailConfirmationOf(options) === 'code'");
		expect(form).toContain('getBridge().emailCode.request(');
		expect(form).toContain("codeOffered ? t('magicLink.sendCode') : t('magicLink.send')");
		expect(form).toContain('getBridge().magicLink.start(');
		expect(form).toContain("isPasswordExpired(error) ? 'expired'");
	});

	it('sign-up types the code, then asks for the password the code proved the address for', () => {
		const form = source('SignUpForm');
		expect(form).toContain("'verify' in started");
		expect(form).toContain("error.code === 'password_required'");
		expect(form).toContain('codeStep.choosePassword(password)');
		expect(form).toContain('<PasswordChecklist');
	});

	it('forgot password goes code, then a new password with its checklist, then "Password changed": never signed in', () => {
		const form = source('ForgotPassword');
		expect(form).toContain('<EmailCodeScreen');
		expect(form).toContain('<SetPassword token={resetToken}');
		expect(form).toContain("t('forgot.changedHeading')");
		expect(source('SetPassword')).toContain('password.set(linkToken, password)');
	});
});

describe('the Security settings', () => {
	it('asks for a recent sign-in through the recheck dialog for every change', () => {
		const settings = source('SecuritySettings');
		for (const call of ['security.totp.start()', 'security.sms.start(', 'security.change({ first: method })', 'security.change({ on })', 'security.remove(method)', 'security.newRecoveryCodes()', 'security.forgetDevices()']) {
			expect(settings, call).toMatch(new RegExp(`withRecheck\\(\\(\\) => [^\\n]*${call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
		}
		expect(settings).toContain("t('security.strongest')");
		expect(settings).toContain('<QrCode');
		expect(settings).toContain('<RecoveryCodes');
		expect(settings).toContain('<ChangePassword');
	});

	it('change password names a wrong current password and one used recently', () => {
		const form = source('ChangePassword');
		expect(form).toContain("error.code === 'wrong_password'");
		expect(form).toContain("error.failed?.includes('history')");
		expect(form).toContain('withRecheck(() => getBridge().password.change({ current, password }))');
		expect(t('password.history')).toBe("You've used this password recently. Choose a different one.");
	});

	it('every new component is exported', async () => {
		const index = await import('../../index.js');
		for (const name of ['SecuritySettings', 'ChangePassword', 'EmailCodeScreen', 'CodeInput', 'QrCode', 'RecoveryCodes', 'SecondStepForm', 'encodeQr', 'emailConfirmationOf']) expect(index, name).toHaveProperty(name);
	});
});
