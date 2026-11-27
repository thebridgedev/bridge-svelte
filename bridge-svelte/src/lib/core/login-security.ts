/**
 * Login security on the sign-in screens: the app's support contact for a
 * suspended person, the strength meter, and the invisible bot check.
 *
 * The rules a password must meet are the server's: the meter reads them from
 * the sign-in options and never calls a password strong that they refuse.
 * Bridge checks every password again, and its answer is the one that counts.
 */
import type { SignInOptions } from '@nebulr-group/bridge-auth-core';

/** The app's support contact as a link: `mailto:` for an email address, the address itself for an https one; null for anything else. */
export function supportLink(contact: string | null | undefined): { readonly href: string; readonly label: string } | null {
	const value = contact?.trim() ?? '';
	if (value === '') return null;
	if (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value)) return { href: `mailto:${value}`, label: value };
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:') return null;
		return { href: url.href, label: `${url.host}${url.pathname === '/' ? '' : url.pathname}` };
	} catch {
		return null;
	}
}

type Rules = NonNullable<SignInOptions['password']>;

/** Whether a password meets the app's rules as the sign-in options show them. */
export function meetsRules(password: string, rules: Rules | undefined, email = ''): boolean {
	if (rules === undefined) return password.length > 0;
	if (password.length < rules.minLength) return false;
	if (rules.maxLength !== undefined && password.length > rules.maxLength) return false;
	if (rules.requireUpper && !/\p{Lu}/u.test(password)) return false;
	if (rules.requireLower && !/\p{Ll}/u.test(password)) return false;
	if (rules.requireDigit && !/\p{Nd}/u.test(password)) return false;
	if (rules.requireSymbol && !/[^\p{L}\p{Nd}]/u.test(password)) return false;
	if (rules.blockEmail && email.includes('@')) {
		const lower = password.toLowerCase();
		const address = email.toLowerCase();
		const local = address.slice(0, address.indexOf('@'));
		if (lower.includes(address) || (local.length >= 3 && lower.includes(local))) return false;
	}
	return true;
}

export type Strength = 'weak' | 'fair' | 'strong';

/** A guess at how hard a password is to guess: 0 (very easy) to 4 (very hard). */
export type Guesser = (password: string, userInputs: readonly string[]) => number;

let guesser: Promise<Guesser> | null = null;

/** The strength estimator, loaded the first time a meter needs it (its word lists are large), once per page. */
export function loadGuesser(): Promise<Guesser> {
	guesser ??= (async () => {
		const [{ zxcvbn, zxcvbnOptions }, common] = await Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common')]);
		zxcvbnOptions.setOptions({ dictionary: { ...common.dictionary }, graphs: common.adjacencyGraphs });
		return (password: string, userInputs: readonly string[]) => zxcvbn(password, [...userInputs]).score;
	})().catch((error: unknown) => {
		guesser = null;
		throw error;
	});
	return guesser;
}

/**
 * How strong a password is, for the meter: weak, fair or strong. A password the app's rules refuse is weak, whatever
 * the estimate, so the meter never says strong for one Bridge would not take. Empty is null (no meter).
 */
export function strengthOf(password: string, rules: Rules | undefined, guess: Guesser, userInputs: readonly string[] = []): Strength | null {
	if (password === '') return null;
	if (!meetsRules(password, rules, userInputs.find((each) => each.includes('@')) ?? '')) return 'weak';
	const score = guess(password, wordsOf(userInputs));
	if (score >= 3) return 'strong';
	if (score === 2) return 'fair';
	return 'weak';
}

/**
 * The person's own words, as the estimator matches them: each as given and in lower case, and an email address also
 * as its local part, that part without separators, and each of its pieces (`anna.berg@…` gives `anna.berg`,
 * `annaberg`, `anna`, `berg`).
 */
export function wordsOf(inputs: readonly string[]): string[] {
	const words = new Set<string>();
	for (const input of inputs) {
		const value = input.trim().toLowerCase();
		if (value === '') continue;
		words.add(value);
		const local = value.includes('@') ? value.slice(0, value.indexOf('@')) : value;
		words.add(local);
		words.add(local.replace(/[^\p{L}\p{Nd}]+/gu, ''));
		for (const piece of local.split(/[^\p{L}\p{Nd}]+/u)) if (piece.length >= 3) words.add(piece);
	}
	words.delete('');
	return [...words];
}

/** Cloudflare Turnstile's script, loaded only on a sign-up form whose app asks for the bot check. */
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The part of Cloudflare's `turnstile` global the bot check uses. */
export interface TurnstileApi {
	render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
	reset(widgetId?: string): void;
	remove(widgetId?: string): void;
}

let script: Promise<TurnstileApi> | null = null;

/** Loads Turnstile's script once per page and resolves with its API. A failed load can be tried again. */
export function loadTurnstile(doc: Document = document, win: Window & { turnstile?: TurnstileApi } = window as Window & { turnstile?: TurnstileApi }): Promise<TurnstileApi> {
	if (win.turnstile !== undefined) return Promise.resolve(win.turnstile);
	script ??= new Promise<TurnstileApi>((resolve, reject) => {
		const tag = doc.createElement('script');
		tag.src = TURNSTILE_SCRIPT;
		tag.async = true;
		tag.defer = true;
		tag.onload = () => (win.turnstile === undefined ? reject(new Error('Turnstile did not load.')) : resolve(win.turnstile));
		tag.onerror = () => reject(new Error('Turnstile could not be loaded.'));
		doc.head.appendChild(tag);
	}).catch((error: unknown) => {
		script = null;
		throw error;
	});
	return script;
}

/** For tests: forget the loaded script and estimator. */
export function forgetLoaded(): void {
	script = null;
	guesser = null;
}

/**
 * The bot check's answer, as it comes: `token()` waits for one (at most `timeoutMs`; then '' and Bridge refuses with
 * `bot-check-failed`), `take()` hands it over once (each answer works once) and `reset()` asks for a new one.
 */
export function botAnswer(timeoutMs = 10_000) {
	let current: string | null = null;
	let waiting: ((token: string) => void)[] = [];
	return {
		set(token: string) {
			current = token;
			for (const each of waiting) each(token);
			waiting = [];
		},
		clear() {
			current = null;
		},
		token(): Promise<string> {
			if (current !== null) return Promise.resolve(current);
			return new Promise<string>((resolve) => {
				const timer = setTimeout(() => {
					waiting = waiting.filter((each) => each !== done);
					resolve('');
				}, timeoutMs);
				const done = (token: string) => {
					clearTimeout(timer);
					resolve(token);
				};
				waiting.push(done);
			});
		},
		async take(): Promise<string> {
			const token = await this.token();
			current = null;
			return token;
		},
	};
}
export type BotAnswer = ReturnType<typeof botAnswer>;
