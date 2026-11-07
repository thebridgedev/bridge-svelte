import { describe, expect, it, vi } from 'vitest';
import { bridgeHandle, flagsFor, meter, requireActor } from './index.js';

const ISSUER = 'https://bridge.example.com/identity-access/apps/app-1';
const offline = (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch;

function eventFor(headers: Record<string, string> = {}, method = 'GET') {
	return { request: new Request('https://app.example.com/api/x', { method, headers }), locals: {} as Record<string, unknown> };
}

describe('bridgeHandle', () => {
	it('lets a request without a credential through with no actor', async () => {
		const handle = bridgeHandle({ issuer: ISSUER, fetch: offline, discoveryRetryMs: 60000 });
		const event = eventFor();
		const resolve = vi.fn(async () => new Response('ok'));
		const response = await handle({ event, resolve } as never);
		expect(await response.text()).toBe('ok');
		expect(resolve).toHaveBeenCalledOnce();
		expect(() => requireActor(event as never)).toThrow();
		expect(() => meter(event as never, 'reports')).toThrow(/signed-in caller/);
		expect((await flagsFor(event as never)).enabled('anything')).toBe(false);
	});

	it('answers 503, never yes, while Bridge cannot check a token', async () => {
		const handle = bridgeHandle({ issuer: ISSUER, fetch: offline, discoveryRetryMs: 60000 });
		const resolve = vi.fn(async () => new Response('ok'));
		const response = await handle({ event: eventFor({ authorization: 'Bearer abc' }), resolve } as never);
		expect(response.status).toBe(503);
		expect(response.headers.get('content-type')).toBe('application/problem+json');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('says how to set it up when the hook is missing', () => {
		expect(() => requireActor({ locals: {} } as never)).toThrow(/bridgeHandle/);
	});
});
