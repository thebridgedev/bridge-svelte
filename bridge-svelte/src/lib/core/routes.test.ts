import { describe, expect, it } from 'vitest';
import { readEmailLink } from '@nebulr-group/bridge-auth-core';
import { pageForLink, parseAuthPage } from './routes.js';

describe('the auth pages', () => {
	it('a passkey setup link lands on its own page', () => {
		const link = readEmailLink('#bridge=passkey-setup&token=abc');
		expect(link).toEqual({ kind: 'passkey-setup', token: 'abc' });
		expect(pageForLink(link!)).toBe('passkey-setup');
		expect(parseAuthPage('passkey-setup')).toBe('passkey-setup');
	});
});
