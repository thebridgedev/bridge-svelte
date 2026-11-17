/**
 * Plan limits and plan features, end to end against auth-core's fake issuer: `useQuota`, `entitlements`,
 * `QuotaGate`, `Entitled`, `QuotaBanner`, the lock and the 402s.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import { get } from 'svelte/store';
import { render } from 'svelte/server';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { resetClient, startClient } from './client.js';
import { resolveConfig } from './config.js';
import { billingGate } from './billing-gate.js';
import { entitlements } from './entitlements.js';
import { bridgeFetch } from './fetch.js';
import { useQuota } from './quota.js';
import { closeUpgrade, onBridgeQuotaExceeded, parseQuotaRefusal, upgradeRequest, type BridgeQuotaRefusal } from './upgrade.js';
import BillingNotice from '../components/billing/BillingNotice.svelte';
import EntitledFixture from '../components/billing/EntitledFixture.test.svelte';
import QuotaBanner from '../components/billing/QuotaBanner.svelte';
import QuotaGateFixture from '../components/billing/QuotaGateFixture.test.svelte';
import { quotaBannerCopy, quotaBannerState } from '../components/billing/quota-copy.js';

const PASSWORD = 'correct horse battery';
const API = 'https://api.example.test';
const read = (used: number, limit: number, extra: object = {}) => ({ used, limit, remaining: Math.max(0, limit - used), policy: 'hard', ...extra });

async function signedIn(options: { flags?: Record<string, boolean>; facts?: Record<string, unknown>; api?: (url: string) => Response } = {}) {
	const fake = createFakeIssuer();
	fake.addPerson({ email: 'alice@acme.test', password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] });
	fake.setFlags({ 'bridge-app-active': true, 'bridge-billing-manage': true, ...options.flags });
	fake.setFacts({ plan: { key: 'free', name: 'Free' }, status: 'active', access: 'ok', ...options.facts });
	const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new Request(input, init).url;
		return options.api !== undefined && url.startsWith(API) ? options.api(url) : fake.fetch(input, init);
	}) as typeof fetch;
	const client = startClient(resolveConfig({ issuer: fake.issuer, tokenOrigins: [API] }, undefined), {
		fetch: fetchFn,
		storage: memoryStorage(),
		autoRefresh: false,
		locks: null,
		tabChannel: null,
		live: false,
	});
	await client.signIn.start({ email: 'alice@acme.test', password: PASSWORD });
	await client.flags.load();
	return { fake, client };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const html = (component: Component<any>, props: Record<string, unknown>): string => render(component, { props }).body;

afterEach(() => {
	resetClient();
	closeUpgrade();
});

describe('useQuota', () => {
	it('is loading, then the numbers, and moves when the quota is read again', async () => {
		const { fake, client } = await signedIn();
		fake.setQuota('tickets', read(8, 10));
		const tickets = useQuota('tickets');
		expect(tickets.loading).toBe(true);
		expect(tickets.used).toBeNull();
		await client.quotas.read('tickets');
		expect(tickets).toMatchObject({ loading: false, unlimited: false, used: 8, limit: 10, remaining: 2, kind: 'counter', warningLevel: 'approaching' });
		expect(tickets.snapshot?.policy).toBe('hard');
		expect(get(tickets)).toMatchObject({ used: 8, limit: 10, state: 'near' });
		fake.setQuota('tickets', read(10, 10, { kind: 'gauge' }));
		await client.quotas.refresh();
		expect(tickets).toMatchObject({ used: 10, kind: 'gauge' });
		expect(get(tickets)).toMatchObject({ used: 10, ratio: 1, state: 'over' });
	});

	it('says unlimited for a metric the plan sets no limit on, and asks once', async () => {
		const { fake } = await signedIn();
		fake.setQuota('seats', null);
		const seats = useQuota(() => 'seats');
		expect(seats.loading).toBe(true);
		await flush();
		expect(seats).toMatchObject({ loading: false, unlimited: true, used: null, limit: null });
		expect(get(seats)).toBeNull();
		void seats.unlimited;
		void seats.unlimited;
		await flush();
		expect(fake.quotaReads.filter((m) => m === 'seats')).toHaveLength(1);
	});

	it('is loading before there is a client, never a zero', () => {
		const tickets = useQuota('tickets');
		expect(tickets).toMatchObject({ loading: true, unlimited: false, used: null, limit: null });
		expect(get(tickets)).toBeNull();
	});
});

describe('entitlements', () => {
	it('reads the entitlement flags, fail-closed, and says when it is ready', async () => {
		expect(get(entitlements)).toMatchObject({ ready: false, all: {} });
		expect(get(entitlements).can('analytics')).toBe(false);
		await signedIn({ flags: { 'bridge:billing.entitlement.analytics': true, 'bridge:billing.entitlement.sso': false, analytics: true } });
		const state = get(entitlements);
		expect(state.ready).toBe(true);
		expect(state.can('analytics')).toBe(true);
		expect(state.can('sso')).toBe(false);
		expect(state.can('unknown')).toBe(false);
		expect(state.all).toEqual({ analytics: true, sso: false });
	});

	it('follows a plan change', async () => {
		const { fake, client } = await signedIn({ flags: { 'bridge:billing.entitlement.sso': false } });
		expect(get(entitlements).can('sso')).toBe(false);
		fake.setFlags({ 'bridge-app-active': true, 'bridge:billing.entitlement.sso': true });
		await client.flags.load();
		expect(get(entitlements).can('sso')).toBe(true);
	});
});

describe('QuotaGate', () => {
	const disabled = (body: string) => /<fieldset[^>]*disabled/.test(body);

	it('disables its children at a hard limit and offers the upgrade', async () => {
		const { fake, client } = await signedIn();
		fake.setQuota('tickets', read(3, 3));
		await client.quotas.read('tickets');
		const body = html(QuotaGateFixture, { metric: 'tickets' });
		expect(disabled(body)).toBe(true);
		expect(body).toContain('data-state="at-limit"');
		expect(body).toContain('all 3 tickets on your plan.');
		expect(body).toContain('href="/subscription"');
		expect(html(QuotaGateFixture, { metric: 'tickets', custom: true })).toContain('3 of 3 used');
	});

	it('never disables on "do not know yet", no limit, a metered limit, or room left', async () => {
		const { fake, client } = await signedIn();
		expect(disabled(html(QuotaGateFixture, { metric: 'tickets' }))).toBe(false);
		expect(html(QuotaGateFixture, { metric: 'tickets' })).toContain('data-state="loading"');
		fake.setQuota('tickets', read(1, 3));
		fake.setQuota('seats', null);
		fake.setQuota('exports', read(9, 5, { policy: 'metered' }));
		await Promise.all(['tickets', 'seats', 'exports'].map((m) => client.quotas.read(m)));
		expect(html(QuotaGateFixture, { metric: 'tickets' })).toContain('data-state="available"');
		expect(html(QuotaGateFixture, { metric: 'seats' })).toContain('data-state="unlimited"');
		expect(html(QuotaGateFixture, { metric: 'exports' })).toContain('data-state="metered"');
		for (const metric of ['tickets', 'seats', 'exports']) expect(disabled(html(QuotaGateFixture, { metric }))).toBe(false);
	});
});

describe('Entitled', () => {
	it('renders neither branch until Bridge has answered, then the one that applies', async () => {
		expect(html(EntitledFixture, { to: 'analytics' })).toContain('id="wait"');
		await signedIn({ flags: { 'bridge:billing.entitlement.analytics': true } });
		const on = html(EntitledFixture, { to: 'analytics' });
		expect(on).toContain('id="yes"');
		expect(on).not.toContain('id="no"');
		const off = html(EntitledFixture, { to: 'sso' });
		expect(off).toContain('id="no"');
		expect(off).not.toContain('id="yes"');
	});
});

describe('QuotaBanner', () => {
	it('shows from 80%, the limit reached, and the overage of a metered limit; nothing below', async () => {
		const { fake, client } = await signedIn();
		fake.setQuota('low', read(1, 10));
		fake.setQuota('near', read(8, 10));
		fake.setQuota('edge', read(10, 10));
		fake.setQuota('over', read(12, 10));
		fake.setQuota('metered', read(12, 10, { policy: 'metered', overageEstimate: 2, currency: 'usd' }));
		await Promise.all(['low', 'near', 'edge', 'over', 'metered'].map((m) => client.quotas.read(m)));
		expect(html(QuotaBanner, { metric: 'low' })).not.toContain('data-bridge-quota-banner');
		expect(html(QuotaBanner, { metric: 'unasked' })).not.toContain('data-bridge-quota-banner');
		const near = html(QuotaBanner, { metric: 'near', label: 'Tickets' });
		expect(near).toContain('data-state="approaching"');
		expect(near).toContain('Tickets approaching cap');
		expect(near).toContain('Upgrade</a>');
		expect(html(QuotaBanner, { metric: 'edge' })).toContain('data-state="reached"');
		expect(html(QuotaBanner, { metric: 'over' })).toContain('data-state="over"');
		const metered = html(QuotaBanner, { metric: 'metered' });
		expect(metered).toContain('data-state="metered"');
		expect(metered).toContain('2 over your 10 included');
	});

	it('tells a person who may not manage billing to ask the owner, without an upgrade link', async () => {
		const { fake, client } = await signedIn({ flags: { 'bridge-billing-manage': false } });
		fake.setQuota('edge', read(10, 10));
		await client.quotas.read('edge');
		const body = html(QuotaBanner, { metric: 'edge' });
		expect(body).toContain('Contact your workspace owner.');
		expect(body).not.toContain('data-bridge-quota-banner-cta');
	});

	it('decides from the numbers when the server sent no warning level', () => {
		const snap = (used: number) => ({ metric: 'm', used, limit: 100, remaining: 100 - used, percent_used: used / 100, policy: 'hard' as const, warningLevel: null, label: 'm' });
		expect(quotaBannerState(snap(79))).toBe('hidden');
		expect(quotaBannerState(snap(80))).toBe('approaching');
		expect(quotaBannerState(snap(95))).toBe('critical');
		expect(quotaBannerState(snap(100))).toBe('reached');
		expect(quotaBannerState(snap(101))).toBe('over');
		expect(quotaBannerCopy(snap(96), false, 'Seats').body).toBe('Your workspace is approaching its Seats cap. Contact your workspace owner.');
		expect(quotaBannerState(undefined)).toBe('hidden');
	});
});

describe('the billing lock', () => {
	const locked = { status: 'past_due', access: 'blocked', locked: true };

	it('shows to the person, as a banner or a blocking screen', async () => {
		await signedIn({ facts: locked });
		await flush();
		expect(get(billingGate)).toMatchObject({ locked: true, severity: 'locked' });
		const banner = html(BillingNotice, {});
		expect(banner).toContain('data-kind="blocked"');
		expect(banner).toContain('Access locked');
		expect(banner).not.toContain('data-bridge-billing-lockscreen');
		const screen = html(BillingNotice, { mode: 'hard' });
		expect(screen).toContain('data-bridge-billing-lockscreen');
		expect(screen).toContain('role="alertdialog"');
	});

	it('shows at once when your API refuses a write because of the lock, and opens no dialog', async () => {
		const { client } = await signedIn({
			api: () => Response.json({ code: 'BILLING_GATE_ENGAGED', reason: 'billing_locked', billing: { status: 'past_due', gateEngaged: true } }, { status: 402 }),
		});
		await flush();
		expect(get(billingGate).locked).toBe(false);
		const response = await bridgeFetch(`${API}/tickets`, { method: 'POST' });
		expect(response.status).toBe(402);
		expect(client.isLocked()).toBe(true);
		expect(get(billingGate)).toMatchObject({ locked: true, recoveryUrl: '/subscription' });
		expect(get(upgradeRequest)).toBeNull();
		expect(html(BillingNotice, { mode: 'hard' })).toContain('data-bridge-billing-lockscreen');
	});
});

describe('a 402 at a plan limit', () => {
	const limit = { statusCode: 402, code: 'QUOTA_EXCEEDED', message: 'Over', metric: 'tickets', used: 3, limit: 3, fix: '/subscription' };

	it('opens the upgrade dialog and tells the listeners, who can stop listening', async () => {
		await signedIn({ api: () => Response.json(limit, { status: 402 }) });
		const heard: BridgeQuotaRefusal[] = [];
		const stop = onBridgeQuotaExceeded((refusal) => heard.push(refusal));
		onBridgeQuotaExceeded(() => {
			throw new Error('a broken listener');
		});
		await bridgeFetch(`${API}/tickets`, { method: 'POST' });
		expect(get(upgradeRequest)).toMatchObject({ kind: 'limit', metric: 'tickets', used: 3, limit: 3, upgradeHref: '/subscription' });
		expect(heard).toEqual([{ metric: 'tickets', used: 3, limit: 3, fix: '/subscription', message: 'Over', url: `${API}/tickets` }]);
		stop();
		await bridgeFetch(`${API}/tickets`, { method: 'POST' });
		expect(heard).toHaveLength(1);
	});

	it('is not a refusal when it is a missing plan feature, a declined card or not a 402 body', () => {
		expect(parseQuotaRefusal({ code: 'FEATURE_NOT_IN_PLAN', flag: 'reports' })).toBeNull();
		expect(parseQuotaRefusal({ code: 'CARD_DECLINED' })).toBeNull();
		expect(parseQuotaRefusal('nope')).toBeNull();
		expect(parseQuotaRefusal({ type: 'urn:bridge:problem:limit-reached', metric: 'seats', limit: 5, used: 5 })).toMatchObject({ metric: 'seats', fix: null });
	});
});

describe('the 0.9 names of the billing components', () => {
  it('BridgeBillingNotice, BridgeQuotaBanner and BridgeUpgradeDialog are the same components as the 1.0 names', async () => {
    const lib = await import('../index.js');
    expect(lib.BridgeBillingNotice).toBe(lib.BillingNotice);
    expect(lib.BridgeQuotaBanner).toBe(lib.QuotaBanner);
    expect(lib.BridgeUpgradeDialog).toBe(lib.UpgradeDialog);
  });
});
