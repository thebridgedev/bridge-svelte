import { describe, expect, it } from 'vitest';
import { initiatedStep } from './initiated.js';

const issuer = 'https://api.acme.test/identity-access/apps/app-test';
const at = (query: string) => `https://app.acme.test/auth/callback?${query}`;
const iss = `iss=${encodeURIComponent(issuer)}`;

describe('a sign-in the hosted page asks the app to start', () => {
	it('starts the app\'s own hosted sign-in in hosted mode, on the sign-up form with the plan for a signup link', () => {
		const config = { issuer, authBase: '/auth', hosted: {} };
		expect(initiatedStep(at(iss), config)).toEqual({ kind: 'start', page: 'sign-in', plan: null });
		expect(initiatedStep(at(`${iss}&page=sign-up&plan=pro`), config)).toEqual({ kind: 'start', page: 'sign-up', plan: 'pro' });
	});

	it('opens the app\'s own page when not in hosted mode', () => {
		const config = { issuer, authBase: '/auth', hosted: null };
		expect(initiatedStep(at(iss), config)).toEqual({ kind: 'own-page', to: '/auth/sign-in' });
		expect(initiatedStep(at(`${iss}&page=sign-up&plan=pro`), config)).toEqual({ kind: 'own-page', to: '/auth/sign-up?signupPlan=pro' });
	});

	it('leaves every other address to the callback as before: another issuer, or a return with a code', () => {
		const config = { issuer, authBase: '/auth', hosted: {} };
		expect(initiatedStep(at(`iss=${encodeURIComponent('https://evil.test/identity-access/apps/app-test')}`), config)).toBeNull();
		expect(initiatedStep(at(`${iss}&code=c&state=s`), config)).toBeNull();
		expect(initiatedStep(at(''), config)).toBeNull();
	});
});
