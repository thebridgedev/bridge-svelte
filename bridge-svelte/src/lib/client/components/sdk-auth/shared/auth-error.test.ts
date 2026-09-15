/**
 * TBP-669 — Bridge's origin-allowlist refusal (403 "Origin not allowed") gets
 * a message naming the origin and the fix; every other error keeps its own.
 * Runs against the auth-core this workspace installs, which predates the
 * `ORIGIN_NOT_ALLOWED` code — i.e. the plain-HttpError path older apps hit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, createTranslator, en } from '@nebulr-group/bridge-auth-core';
import { _resetOriginReports, authErrorMessage, isOriginNotAllowed } from './auth-error.js';
import { ALLOWED_ORIGINS_ADMIN_PATH, ORIGIN_NOT_ALLOWED_DOCS_URL } from '../../../../shared/allowed-origins.js';

const ORIGIN = 'http://localhost:5181';
const t = createTranslator();
const originRefusal = () =>
	new HttpError('Origin not allowed', 403, { message: 'Origin not allowed', error: 'Forbidden', statusCode: 403 });

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	_resetOriginReports();
	vi.stubGlobal('location', { origin: ORIGIN });
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllGlobals();
	consoleError.mockRestore();
});

describe('isOriginNotAllowed', () => {
	it('recognises the plain HttpError an older auth-core throws, and the TBP-669 code', () => {
		expect(isOriginNotAllowed(originRefusal())).toBe(true);
		expect(isOriginNotAllowed({ code: 'ORIGIN_NOT_ALLOWED', status: 403, message: 'anything' })).toBe(true);
	});

	it('is false for every other 403 and for other statuses', () => {
		expect(isOriginNotAllowed(new HttpError('User is disabled', 403, { message: 'User is disabled' }))).toBe(false);
		expect(isOriginNotAllowed(new HttpError('HTTP 403: Forbidden', 403, {}))).toBe(false);
		expect(isOriginNotAllowed(new HttpError('Origin not allowed', 401, { message: 'Origin not allowed' }))).toBe(false);
		expect(isOriginNotAllowed(new Error('Origin not allowed'))).toBe(false);
		expect(isOriginNotAllowed(undefined)).toBe(false);
	});
});

describe('authErrorMessage', () => {
	it('turns the origin refusal into what happened and how to fix it', () => {
		const msg = authErrorMessage(originRefusal(), t, 'login.error.invalidCredentials');
		expect(msg).toBe(
			`This app's allowed origins in Bridge don't include ${ORIGIN} — add it in Bridge admin under ${ALLOWED_ORIGINS_ADMIN_PATH}.`,
		);
		expect(msg).not.toBe('Origin not allowed');
	});

	it('logs one console line with a docs link, once per origin', () => {
		authErrorMessage(originRefusal(), t, 'login.error.invalidCredentials');
		authErrorMessage(originRefusal(), t, 'magicLink.error.auth');
		expect(consoleError).toHaveBeenCalledTimes(1);
		const line = String(consoleError.mock.calls[0][0]);
		expect(line).not.toContain('\n');
		expect(line).toContain(ORIGIN);
		expect(line).toContain(ORIGIN_NOT_ALLOWED_DOCS_URL);
	});

	it('does not log again when auth-core already did (code ORIGIN_NOT_ALLOWED)', () => {
		authErrorMessage({ code: 'ORIGIN_NOT_ALLOWED', status: 403, message: 'x' }, t, 'login.error.invalidCredentials');
		expect(consoleError).not.toHaveBeenCalled();
	});

	it('keeps other errors’ own messages, and the translated fallback when there is none', () => {
		expect(authErrorMessage(new HttpError('User is disabled', 403), t, 'login.error.invalidCredentials')).toBe(
			'User is disabled',
		);
		expect(authErrorMessage(new HttpError('Invalid credentials', 401), t, 'login.error.invalidCredentials')).toBe(
			'Invalid credentials',
		);
		expect(authErrorMessage({}, t, 'login.error.invalidCredentials')).toBe(en['login.error.invalidCredentials']);
		expect(consoleError).not.toHaveBeenCalled();
	});
});
