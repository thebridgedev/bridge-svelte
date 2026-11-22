import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { setAppCopy } from '../../core/i18n.js';
import { PLUGIN_LOCALES } from '../../core/messages.js';
import { safePage, termsParts } from '../../core/terms.js';
import TermsNotice from './TermsNotice.svelte';

const notice = { terms: 'https://acme.test/terms', privacy: 'https://acme.test/privacy' };
const html = (props: Record<string, unknown>) => render(TermsNotice, { props }).body;

afterEach(() => setAppCopy(undefined, {}));

describe('the terms line on sign-up (TBP-864)', () => {
	it('says "By continuing you accept [app]\'s Terms of Service and Privacy Policy", linked to the app\'s own pages', () => {
		const out = html({ notice, appName: 'Acme' });
		expect(out).toContain("By continuing you accept Acme's ");
		expect(out).toMatch(/<a [^>]*href="https:\/\/acme\.test\/terms"[^>]*>Terms of Service<\/a>/);
		expect(out).toMatch(/<a [^>]*href="https:\/\/acme\.test\/privacy"[^>]*>Privacy Policy<\/a>/);
		expect(out).toContain('rel="noopener noreferrer"');
	});

	it('shows nothing when the app switched the line off or has no real pages (no signUpNotice)', () => {
		expect(html({ notice: undefined, appName: 'Acme' })).not.toContain('bridge-terms-notice');
		expect(html({ notice: null, appName: 'Acme' })).not.toContain('bridge-terms-notice');
	});

	it('leaves the app out of the sentence when it has no name', () => {
		const out = html({ notice, appName: null });
		expect(out).toContain('By continuing you accept the ');
		expect(out).not.toContain('{app}');
	});

	it('follows the app\'s language', () => {
		setAppCopy('sv', {});
		const out = html({ notice, appName: 'Acme' });
		expect(out).toContain('Genom att fortsätta godkänner du Acmes ');
		expect(out).toContain('>användarvillkor</a>');
		expect(out).toContain('>integritetspolicy</a>');
	});

	it('shows a page that is not an http(s) address as plain text, never as a link', () => {
		const out = html({ notice: { terms: 'javascript:alert(1)', privacy: 'https://acme.test/privacy' }, appName: 'Acme' });
		expect(out).not.toContain('javascript:');
		expect(out).toContain('Terms of Service');
		expect(out).toContain('href="https://acme.test/privacy"');
		expect(safePage('https://user:pw@acme.test/')).toBeNull();
		expect(safePage('/relative')).toBeNull();
		expect(safePage(undefined)).toBeNull();
	});

	it('every language writes both links into its sentence, with or without the app', () => {
		for (const [locale, messages] of Object.entries(PLUGIN_LOCALES)) {
			expect(messages['terms.notice'], locale).toContain('{terms}');
			expect(messages['terms.notice'], locale).toContain('{privacy}');
			expect(messages['terms.notice'], locale).toContain('{app}');
			expect(messages['terms.noticeNoApp'], locale).toContain('{terms}');
			expect(messages['terms.noticeNoApp'], locale).toContain('{privacy}');
		}
	});

	it('splits a sentence into text and the two links, in the order the language writes them', () => {
		expect(termsParts('A {privacy} then {terms}.', { terms: 'T', privacy: 'P' })).toEqual([{ text: 'A ' }, { link: 'privacy', label: 'P' }, { text: ' then ' }, { link: 'terms', label: 'T' }, { text: '.' }]);
	});
});

describe('the line names the app, in every language (TBP-864)', () => {
	it('renders the app\'s name and both link labels in each of the plugin\'s languages', () => {
		try {
			for (const [locale, messages] of Object.entries(PLUGIN_LOCALES)) {
				setAppCopy(locale, {});
				const out = html({ notice, appName: 'Acme' });
				expect(out, locale).toContain('Acme');
				expect(out, locale).toContain(`>${messages['terms.terms']}</a>`);
				expect(out, locale).toContain(`>${messages['terms.privacy']}</a>`);
				expect(out, locale).not.toContain('{app}');
			}
		} finally {
			setAppCopy(undefined, {});
		}
	});

	it('names the app from the sign-in options\' app name, the one the server sends from the app\'s registry copy', () => {
		const out = html({ notice, appName: '  Acme Cloud ' });
		expect(out).toContain("By continuing you accept Acme Cloud's ");
	});
});

describe('where the line is shown', () => {
	const files = import.meta.glob(['../auth/SignUpForm.svelte', '../auth/SignInForm.svelte', '../auth/InviteLanding.svelte'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

	it('under the sign-up form, from the sign-in options', () => {
		expect(files['../auth/SignUpForm.svelte']).toMatch(/<TermsNotice notice=\{options\?\.signUpNotice\} appName=\{options\?\.app\.name\}/);
	});

	it('an invite\'s sign-up is the same form, so it shows the line too', () => {
		expect(files['../auth/InviteLanding.svelte']).toMatch(/<SignUpForm/);
	});
});
