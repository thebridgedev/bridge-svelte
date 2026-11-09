import { describe, expect, it } from 'vitest';
import type { SessionState } from '@nebulr-group/bridge-auth-core';
import { checkIssuer, resolveConfig, type BridgeConfig } from './config.js';
import { decide, flagsAllow, normalizePath, type FlagReader } from './guard.js';

const ISSUER = 'https://bridge.example.com/identity-access/apps/app-1';
const signedIn: SessionState = { status: 'signed-in', user: { id: 'u1', email: 'a@x.test', emailVerified: true }, workspace: { id: 'w1', standing: 'active' } };
const signedOut: SessionState = { status: 'signed-out', reason: 'never-signed-in' };
const on = (...keys: string[]): FlagReader => ({ enabled: (key) => keys.includes(key) });
const ACTIVE = 'bridge-app-active';

function run(config: BridgeConfig, path: string, session: SessionState, flags: FlagReader = on(ACTIVE), returnTo: string | null = null) {
	return decide(resolveConfig({ issuer: ISSUER, ...config }, undefined), { path, target: path, session, flags, returnTo });
}

describe('checkIssuer', () => {
	it('takes https, and http only on this machine', () => {
		expect(checkIssuer(ISSUER)).toBe(ISSUER);
		expect(checkIssuer('http://localhost:4400/identity-access/apps/a')).toBe('http://localhost:4400/identity-access/apps/a');
		expect(checkIssuer('http://127.0.0.1:4400/x')).toBe('http://127.0.0.1:4400/x');
		expect(() => checkIssuer('http://bridge.example.com/x')).toThrow(/https/);
		expect(() => checkIssuer('https://user:pw@bridge.example.com/x')).toThrow(/plain address/);
		expect(() => checkIssuer('https://bridge.example.com/x?y=1')).toThrow(/plain address/);
		expect(() => checkIssuer(undefined)).toThrow(/PUBLIC_BRIDGE_ISSUER/);
	});

	it('falls back to the environment issuer', () => {
		expect(resolveConfig({}, ISSUER).issuer).toBe(ISSUER);
	});
});

describe('defaults', () => {
	it('fills every default', () => {
		const config = resolveConfig({ issuer: ISSUER }, undefined);
		expect(config.authBase).toBe('/auth');
		expect(config.afterSignOut).toBe('/auth/sign-in');
		expect(config.paywall).toBe('/subscription/plan');
		expect(config.flagKeys).toEqual({ billingManage: 'bridge-billing-manage', teamManage: 'bridge-team-manage', appActive: ACTIVE });
		expect(config.handoff).toBeNull();
		expect(resolveConfig({ issuer: ISSUER, billing: { paywall: false } }, undefined).paywall).toBeNull();
		expect(resolveConfig({ issuer: ISSUER, handoff: { loopback: true, program: 'the CLI' } }, undefined).handoff).toEqual({ program: 'the CLI' });
	});
});

describe('decide', () => {
	it('sends a visitor on a protected page to sign-in, keeping where they were going', () => {
		expect(run({}, '/reports', signedOut)).toEqual({ type: 'sign-in', to: '/auth/sign-in?redirectUri=%2Freports' });
	});

	it('lets a visitor see public pages and every auth page', () => {
		expect(run({ rules: [{ match: '/', public: true }] }, '/', signedOut)).toEqual({ type: 'allow' });
		expect(run({}, '/auth/sign-up', signedOut)).toEqual({ type: 'allow' });
		expect(run({}, '/auth/handoff', signedIn)).toEqual({ type: 'allow' });
		expect(run({ defaultAccess: 'public' }, '/anything', signedOut)).toEqual({ type: 'allow' });
	});

	it('sends a signed-in person on from sign-in, to a safe return address only', () => {
		expect(run({}, '/auth/sign-in', signedIn, on(ACTIVE), '/reports')).toEqual({ type: 'redirect', to: '/reports', reason: 'signed-in' });
		expect(run({}, '/auth/sign-in', signedIn, on(ACTIVE), 'https://evil.test/')).toEqual({ type: 'redirect', to: '/', reason: 'signed-in' });
		expect(run({}, '/auth/sign-in', signedIn, on(ACTIVE), '//evil.test')).toEqual({ type: 'redirect', to: '/', reason: 'signed-in' });
	});

	it('gates on flags, never on anything else', () => {
		const rules = [{ match: '/reports/*', featureFlag: 'reports', redirectTo: '/' }];
		expect(run({ rules }, '/reports/q1', signedIn)).toEqual({ type: 'redirect', to: '/', reason: 'flag' });
		expect(run({ rules }, '/reports/q1', signedIn, on(ACTIVE, 'reports'))).toEqual({ type: 'allow' });
		expect(run({ rules: [{ match: '/x', featureFlag: 'x' }] }, '/x', signedIn)).toEqual({ type: 'redirect', to: '/', reason: 'flag' });
		expect(run({ rules: [{ match: '/', featureFlag: 'home' }] }, '/', signedIn)).toEqual({ type: 'forbidden' });
	});

	it('matches RegExp rules and wildcards, first rule wins', () => {
		const rules = [
			{ match: /^\/docs(\/|$)/, public: true },
			{ match: '/docs/private', public: false },
		];
		expect(run({ rules }, '/docs/private', signedOut)).toEqual({ type: 'allow' });
	});

	it('shows the paywall while the app is not active, except on billing pages', () => {
		expect(run({}, '/reports', signedIn, on())).toEqual({ type: 'redirect', to: '/subscription/plan?redirectUri=%2Freports', reason: 'paywall' });
		expect(run({}, '/subscription/plan', signedIn, on())).toEqual({ type: 'allow' });
		expect(run({}, '/subscription', signedIn, on())).toEqual({ type: 'allow' });
		expect(run({ billing: { paywall: false } }, '/reports', signedIn, on())).toEqual({ type: 'allow' });
		expect(run({ rules: [{ match: '/', public: true }] }, '/', signedIn, on())).toEqual({ type: 'allow' });
	});
});

describe('paths, as the router resolves them', () => {
	it('decodes once and drops a trailing slash', () => {
		expect(normalizePath('/reports/')).toBe('/reports');
		expect(normalizePath('/reports//')).toBe('/reports');
		expect(normalizePath('/%72eports')).toBe('/reports');
		expect(normalizePath('/%72eports/')).toBe('/reports');
		expect(normalizePath('/')).toBe('/');
		// Decoded once, as SvelteKit does: a double encoding is not this route for the router either.
		expect(normalizePath('/%2572eports')).toBe('/%2572eports');
		expect(normalizePath('/a%2Fb')).toBe('/a%2Fb');
		expect(normalizePath('/%E0%A4%A')).toBe('/%E0%A4%A');
	});

	it('keeps a page behind a flag closed however its address is written', () => {
		const rules = [{ match: '/reports', featureFlag: 'reports', redirectTo: '/' }];
		for (const path of ['/reports', '/reports/', '/%72eports', '/%72eports/', '/%72%65ports']) {
			expect(run({ rules }, path, signedIn), path).toEqual({ type: 'redirect', to: '/', reason: 'flag' });
		}
		const open = [{ match: '/account/*', public: false }];
		expect(run({ rules: open, defaultAccess: 'public' }, '/%61ccount/x', signedOut).type).toBe('sign-in');
	});
});

describe('flagsAllow', () => {
	it('reads one, any or all', () => {
		expect(flagsAllow('a', on('a'))).toBe(true);
		expect(flagsAllow({ any: ['a', 'b'] }, on('b'))).toBe(true);
		expect(flagsAllow({ all: ['a', 'b'] }, on('b'))).toBe(false);
		expect(flagsAllow({ all: [] }, on())).toBe(false);
	});
});
