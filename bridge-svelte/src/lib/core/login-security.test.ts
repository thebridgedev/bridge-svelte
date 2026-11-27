import { afterEach, describe, expect, it } from 'vitest';
import { BridgeError } from '@nebulr-group/bridge-auth-core';
import { errorMessage, translator } from './i18n.js';
import { botAnswer, forgetLoaded, loadGuesser, loadTurnstile, meetsRules, strengthOf, supportLink, TURNSTILE_SCRIPT, wordsOf, type TurnstileApi } from './login-security.js';

/** Every component, as source text, by file name. */
const files = import.meta.glob(['../components/**/*.svelte', './*.ts', '../*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sourceOf = (name: string): string => Object.entries(files).find(([path]) => path.endsWith(`/${name}`))?.[1] as string;

afterEach(() => forgetLoaded());

describe("the suspended message names the app's own support contact (TBP-84)", () => {
	it('links an email address with mailto, and an https address as itself', () => {
		expect(supportLink('support@acme-demo.com')).toEqual({ href: 'mailto:support@acme-demo.com', label: 'support@acme-demo.com' });
		expect(supportLink('https://acme-demo.com/help')).toEqual({ href: 'https://acme-demo.com/help', label: 'acme-demo.com/help' });
		expect(supportLink(' https://acme-demo.com ')).toEqual({ href: 'https://acme-demo.com/', label: 'acme-demo.com' });
	});

	it('shows no link for none, for a plain-http address or for anything else', () => {
		expect(supportLink(undefined)).toBeNull();
		expect(supportLink('')).toBeNull();
		expect(supportLink('http://acme-demo.com')).toBeNull();
		expect(supportLink('javascript:alert(1)')).toBeNull();
		expect(supportLink('call us')).toBeNull();
	});

	it('the sign-in form shows it with the suspended message, and only then', () => {
		const form = sourceOf('auth/SignInForm.svelte');
		expect(form).toMatch(/failureKind === 'suspended' \? supportLink\(options\?\.supportContact\)/);
		expect(form).toMatch(/data-bridge-support-contact/);
	});

	it('says suspended, a blocked domain, a throwaway address and a failed bot check in plain words', () => {
		const t = translator();
		expect(errorMessage(new BridgeError('suspended', 'x', { code: 'user_suspended' }), t)).toBe('Your account has been suspended.');
		expect(errorMessage(new BridgeError('domain-blocked', 'x'), t)).toBe("Sign-ups from this email domain aren't allowed.");
		expect(errorMessage(new BridgeError('permanent-email-required', 'x'), t)).toBe('Please use a permanent email address.');
		expect(errorMessage(new BridgeError('bot-check-failed', 'x'), t)).toBe('We could not check that you are a person. Please try again.');
	});
});

describe('the invisible bot check (TBP-83)', () => {
	function fakePage() {
		const added: { src: string; onload?: () => void; onerror?: () => void }[] = [];
		const doc = { createElement: () => ({}) as { src: string }, head: { appendChild: (tag: { src: string }) => added.push(tag) } } as unknown as Document;
		const win = {} as Window & { turnstile?: TurnstileApi };
		return { added, doc, win };
	}

	it("loads Cloudflare's script once, and only when asked", async () => {
		const { added, doc, win } = fakePage();
		const first = loadTurnstile(doc, win);
		const second = loadTurnstile(doc, win);
		expect(added).toHaveLength(1);
		expect(added[0]!.src).toBe(TURNSTILE_SCRIPT);
		const api = { render: () => 'w1', reset: () => undefined, remove: () => undefined };
		win.turnstile = api;
		added[0]!.onload?.();
		await expect(first).resolves.toBe(api);
		await expect(second).resolves.toBe(api);
	});

	it('a script that could not load can be tried again', async () => {
		const { added, doc, win } = fakePage();
		const first = loadTurnstile(doc, win);
		added[0]!.onerror?.();
		await expect(first).rejects.toThrow();
		void loadTurnstile(doc, win).catch(() => undefined);
		expect(added).toHaveLength(2);
	});

	it('hands each answer over once, waits a moment for one, and then sends none (Bridge refuses)', async () => {
		const answer = botAnswer(20);
		const waiting = answer.take();
		answer.set('tok-1');
		await expect(waiting).resolves.toBe('tok-1');
		await expect(answer.take()).resolves.toBe('');
		answer.set('tok-2');
		answer.clear();
		await expect(answer.take()).resolves.toBe('');
	});

	it('runs on the sign-up form of one\'s own only: never on an invite, social or company sign-in', () => {
		const signUp = sourceOf('auth/SignUpForm.svelte');
		expect(signUp).toMatch(/const botCheck = \$derived\(invite \? undefined : options\?\.botCheck\)/);
		expect(signUp).toMatch(/\{#if botCheck !== undefined\}\s*<BotCheck/);
		expect(signUp).toMatch(/turnstileToken/);
		for (const name of ['auth/SocialButtons.svelte', 'auth/SignInForm.svelte', 'auth/HostedSignIn.svelte', 'auth/InviteLanding.svelte']) {
			expect([name, /BotCheck|turnstile/i.test(sourceOf(name))]).toEqual([name, false]);
		}
		// Cloudflare's address is in one place only.
		const loading = Object.entries(files).filter(([, text]) => text.includes('challenges.cloudflare.com')).map(([path]) => path);
		expect(loading).toEqual([expect.stringMatching(/login-security\.ts$/)]);
	});

	it('sends a field people never see, and how long the form took', () => {
		const signUp = sourceOf('auth/SignUpForm.svelte');
		expect(signUp).toMatch(/class="bridge-hp-field" aria-hidden="true"/);
		expect(signUp).toMatch(/tabindex="-1" autocomplete="off"/);
		expect(signUp).toMatch(/formMs: Date\.now\(\) - openedAt/);
	});
});

describe('leaked passwords (TBP-85)', () => {
	it('on Warn offers to use it anyway; on Refuse says choose another', () => {
		const t = translator();
		expect(errorMessage(new BridgeError('password-leaked', 'x', { leakedPasswords: 'warn' }), t)).toBe('This password has appeared in a public data leak. Choose another, or use it anyway.');
		expect(errorMessage(new BridgeError('password-leaked', 'x', { leakedPasswords: 'refuse' }), t)).toBe('This password has appeared in a public data leak. Choose another.');
		expect(errorMessage(new BridgeError('password-change-required', 'x', { code: 'leaked_password' }), t)).toBe(t('login.leaked.refuse'));
		for (const name of ['auth/SignUpForm.svelte', 'auth/SetPassword.svelte', 'auth/VerifyEmail.svelte']) {
			expect([name, /data-bridge-leaked-use-anyway/.test(sourceOf(name))]).toEqual([name, true]);
		}
	});

	it('after signing in: on Warn a change step with "Not now", on Refuse the link to set a new password', () => {
		const form = sourceOf('auth/SignInForm.svelte');
		expect(form).toMatch(/step\.done && step\.passwordLeaked === true/);
		expect(form).toMatch(/isBridgeError\(error, 'password-change-required'\)/);
		const step = sourceOf('auth/LeakedPasswordStep.svelte');
		expect(step).toMatch(/password\.forgot\(email\)/);
		expect(step).toMatch(/\{#if mode === 'warn'\}[\s\S]*data-bridge-leaked-not-now/);
	});
});

describe('the strength meter never contradicts the rules (TBP-85)', () => {
	const rules = { minLength: 10, requireDigit: true, blockEmail: true };
	const always = (score: number) => () => score;

	it('checks the rules as the sign-in options show them', () => {
		expect(meetsRules('short1', rules)).toBe(false);
		expect(meetsRules('long enough but no digit', rules)).toBe(false);
		expect(meetsRules('long enough 4 sure', rules)).toBe(true);
		expect(meetsRules('anna.berg-2024-x', rules, 'anna.berg@acme.test')).toBe(false);
		expect(meetsRules('Aa1!', { minLength: 4, requireUpper: true, requireLower: true, requireDigit: true, requireSymbol: true })).toBe(true);
		expect(meetsRules('aa1!', { minLength: 4, requireUpper: true })).toBe(false);
		expect(meetsRules('x'.repeat(20), { minLength: 4, maxLength: 16 })).toBe(false);
		expect(meetsRules('anything', undefined)).toBe(true);
	});

	it('is weak for a password the rules refuse, however hard to guess', () => {
		expect(strengthOf('Zq#81!vW', rules, always(4))).toBe('weak');
		expect(strengthOf('', rules, always(4))).toBeNull();
	});

	it('is weak, fair or strong by the estimate for one the rules take', () => {
		expect(strengthOf('long enough 4 sure', rules, always(1))).toBe('weak');
		expect(strengthOf('long enough 4 sure', rules, always(2))).toBe('fair');
		expect(strengthOf('long enough 4 sure', rules, always(3))).toBe('strong');
	});

	it('with the real estimator: a common password is weak, a long random one strong', async () => {
		const guess = await loadGuesser();
		expect(strengthOf('Password123!', { minLength: 8 }, guess)).toBe('weak');
		expect(strengthOf('violet-tractor-moss-91-quill', { minLength: 8 }, guess)).toBe('strong');
		// The person's own address and names count against it.
		expect(strengthOf('annaberg2024', { minLength: 8 }, guess, ['anna.berg@acme.test', 'Anna', 'Berg'])).toBe('weak');
	}, 20_000);

	it("splits the person's email into the words a password should not lean on", () => {
		expect(wordsOf(['Anna.Berg@acme.test', 'Anna', ' '])).toEqual(['anna.berg@acme.test', 'anna.berg', 'annaberg', 'anna', 'berg']);
	});

	it('is on every screen that sets a password', () => {
		for (const name of ['auth/SignUpForm.svelte', 'auth/SetPassword.svelte', 'auth/VerifyEmail.svelte']) {
			expect([name, /<PasswordStrength\b/.test(sourceOf(name))]).toEqual([name, true]);
		}
	});
});

describe('signing up again at the workspace limit (TBP-87)', () => {
	it('says "You already have an account, so we signed you in", then the usual workspace pick', () => {
		expect(translator()('signup.alreadyHadAccount')).toBe('You already have an account, so we signed you in.');
		const verify = sourceOf('auth/VerifyEmail.svelte');
		expect(verify).toMatch(/step\.alreadyHadAccount === true/);
		expect(verify).toMatch(/\{#if already\}<Alert variant="info" data-bridge-already-had-account>/);
	});
});
