import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-762 (milestone TBP-M35): right after checkout the success page shows
 * the plan just bought, and picking Free moves on.
 *
 * The owner's run showed "Subscription unavailable" on /subscription/success:
 * a checkout bumped every member's sign-in version three times in ~2 s and
 * the page's plan request answered 401 TOKEN_VERSION_STALE without a retry.
 * On bridge-svelte 0.9.0-beta.8 (auth-core 0.8.0-beta.5) there is one billing
 * store with one refresh rule, a stale sign-in is retried, and the server
 * bumps the version once per checkout.
 *
 * A fresh SvelteKit app (published beta, one billing file) against a stage
 * app selling Free and Premium ($5, Stripe test mode). The owner's workspace
 * has no plan: they pick Free, land on the success page, then upgrade to
 * Premium through a real Stripe test checkout. The success page badge reads
 * "Premium active" on arrival and after a reload.
 *
 * Setup is part of the file: the stage app is deleted and recreated through
 * the stage test endpoints (PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage; Stripe test keys STRIPE_TEST_PK /
 * STRIPE_TEST_SK from bridge-svelte's config/.env.test.local; never printed).
 * The container, the scratch project and the stage app are removed at the end.
 *
 * Re-run (memory preflight first — this starts one install and one dev container, one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-762 bridge-plugins/bridge-svelte/demos/the-plan-shows-right-after-checkout.demo.ts --base-url http://localhost:5292
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_ENV = process.env.DEMO_SVELTE_TEST_ENV ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-plugins/bridge-svelte/config/.env.test.local';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.8';
const DOMAIN = 'demo-plan-after-checkout';
const PORT = 5292;
const LOCAL = `http://localhost:${PORT}`;
const CONTAINER = 'demo-plan-after-checkout';

function envValue(file: string, name: string): string {
	const line = readFileSync(file, 'utf8')
		.split('\n')
		.find((l) => l.startsWith(`${name}=`));
	const value = line?.slice(name.length + 1).trim().replace(/^"|"$/g, '');
	if (!value) throw new Error(`${name} missing from ${file}`);
	return value;
}
const headers = () => ({ 'Content-Type': 'application/json', 'x-playwright-api-key': envValue(join(API_DIR, 'config/.env.stage'), 'PLAYWRIGHT_TEST_API_KEY') });

/** Stage Lambdas answer a cold first call with a 5xx now and then; retry once. */
async function post<T>(path: string, body: unknown): Promise<T> {
	const init = { method: 'POST', headers: headers(), body: JSON.stringify(body) };
	let res = await fetch(`${STAGE}/account/test/playwright/${path}`, init);
	if (!res.ok) {
		await new Promise((r) => setTimeout(r, 3000));
		res = await fetch(`${STAGE}/account/test/playwright/${path}`, init);
	}
	if (!res.ok) throw new Error(`POST ${path} answered ${res.status}: ${await res.text()}`);
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}
const removeApp = () => fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ domain: DOMAIN }) }).catch(() => {});

function writeProject(dir: string, appId: string) {
	const w = (path: string, text: string) => {
		mkdirSync(join(dir, path, '..'), { recursive: true });
		writeFileSync(join(dir, path), text);
	};
	w(
		'package.json',
		JSON.stringify(
			{
				name: 'my-app',
				private: true,
				type: 'module',
				scripts: { dev: `vite dev --host 0.0.0.0 --port ${PORT} --strictPort` },
				dependencies: { '@nebulr-group/bridge-svelte': SVELTE_VERSION, '@stripe/stripe-js': '^7' },
				devDependencies: { '@sveltejs/kit': '^2', '@sveltejs/vite-plugin-svelte': '^5', svelte: '^5', vite: '^6' }
			},
			null,
			2
		)
	);
	w('vite.config.js', "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({ plugins: [sveltekit()] });\n");
	w('svelte.config.js', 'export default { kit: {} };\n');
	w(
		'src/app.html',
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t\t%sveltekit.head%\n\t</head>\n\t<body style="font-family: system-ui, sans-serif; margin: 64px 48px 48px">\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>\n'
	);
	w('.env', `VITE_BRIDGE_APP_ID=${appId}\nVITE_BRIDGE_API_BASE_URL=${STAGE}\n`);
	w(
		'src/routes/+layout.ts',
		`import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;
export const load = bridgeBootstrap({
	loginRoute: '/auth/login',
	rules: [{ match: new RegExp('^/auth($|/)'), public: true }],
	defaultAccess: 'protected'
});
`
	);
	w(
		'src/routes/+layout.svelte',
		`<script lang="ts">
	import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
	import '@nebulr-group/bridge-svelte/styles';
	let { children } = $props();
</script>

<BridgeBootstrap>{@render children()}</BridgeBootstrap>
`
	);
	w('src/routes/+page.svelte', '<h1>Dashboard</h1>\n<p><a href="/subscription">Subscription</a></p>\n');
	w('src/routes/auth/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeAuthRoutes />\n");
	w('src/routes/subscription/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeBillingRoutes />\n");
}

async function waitForUrl(url: string, timeoutMs: number) {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`${url} did not come up within ${timeoutMs} ms`);
}

/** Headless Chromium has no address bar: pin the page's address to the top so the frame shows where the visitor is. */
async function showAddress(page: Page) {
	await page.evaluate(() => {
		document.getElementById('__demo_addr')?.remove();
		const bar = document.createElement('div');
		bar.id = '__demo_addr';
		bar.textContent = location.host.endsWith('stripe.com') ? `${location.origin}/…` : location.origin + location.pathname;
		bar.setAttribute(
			'style',
			'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;padding:6px 16px;border-radius:999px;' +
				'background:#f1f3f5;border:1px solid #d0d5db;color:#1d1f24;font:500 14px/1.3 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)'
		);
		document.documentElement.appendChild(bar);
	});
}

// Stripe's checkout page forbids inline styles; without this the caption and the address bar vanish there.
test.use({ bypassCSP: true });

test('Right after checkout, the success page shows the plan just bought', async ({ demo }) => {
	test.setTimeout(12 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const stripe = { pk: envValue(SVELTE_ENV, 'STRIPE_TEST_PK'), sk: envValue(SVELTE_ENV, 'STRIPE_TEST_SK') };
	const email = `${DOMAIN}@example.com`;
	const password = `Demo-${Date.now()}-Aa1!`;

	await removeApp();
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', { domain: DOMAIN, appName: 'Plan after checkout demo', ownerEmail: email, ownerPassword: password, appUrl: LOCAL });
	const dir = mkdtempSync(join(tmpdir(), 'my-app-'));
	const at = { cwd: dir, promptDir: 'my-app', title: 'my-app — a fresh SvelteKit app', timeoutMs: 300_000, redact: [stripe.pk, stripe.sk, password] };
	const unavailable: string[] = [];
	const stale: string[] = [];

	try {
		await post('configure-app', {
			appDomain: DOMAIN,
			allowedOrigins: [LOCAL],
			redirectUris: [`${LOCAL}/auth/oauth-callback`],
			defaultCallbackUri: `${LOCAL}/auth/oauth-callback`,
			paymentsAutoRedirect: true,
			stripeEnabled: true,
			stripePublicKey: stripe.pk,
			stripeSecretKey: stripe.sk,
			currency: 'USD'
		});
		const cleared = await post<{ shouldSelectPlan: boolean }>('clear-tenant-plan', { appDomain: DOMAIN, tenantId: app.tenantId });
		expect(cleared.shouldSelectPlan).toBe(true);
		for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: DOMAIN, key }).catch(() => {});
		await post('ensure-plan', { appDomain: DOMAIN, key: 'free', name: 'Free', description: 'Free', trial: false, trialDays: 0, prices: [{ amount: 0, currency: 'USD', recurrenceInterval: 'month' }] });
		await post('ensure-plan', { appDomain: DOMAIN, key: 'premium', name: 'Premium', description: 'Premium', trial: false, trialDays: 0, prices: [{ amount: 5, currency: 'USD', recurrenceInterval: 'month' }] });
		writeProject(dir, app.appId);

		// Anything the owner would notice, or a stale sign-in answer, is recorded for the asserts.
		page.on('response', async (res) => {
			if (res.status() !== 401 || !res.url().startsWith(STAGE)) return;
			const body = await res.text().catch(() => '');
			if (body.includes('TOKEN_VERSION_STALE')) stale.push(new URL(res.url()).pathname);
		});
		await page.exposeFunction('__demoUnavailable', (text: string) => unavailable.push(text));
		await page.addInitScript(() => {
			new MutationObserver(() => {
				const t = document.querySelector('.bridge-subscription-status')?.textContent ?? '';
				if (/unavailable/i.test(t)) (window as unknown as { __demoUnavailable?: (t: string) => void }).__demoUnavailable?.(t.trim());
			}).observe(document, { childList: true, subtree: true, characterData: true });
		});

		await step(`A fresh SvelteKit app on the published plugin (${SVELTE_VERSION}) with one billing file; install and start it`, async () => {
			await terminal(
				`set -o pipefail; docker run --rm -v "${dir}":/w -w /w -e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error -e NPM_CONFIG_FUND=false -e NPM_CONFIG_AUDIT=false node:22 sh -c 'npm install 2>&1 | tail -1 && npm ls @nebulr-group/bridge-svelte @nebulr-group/bridge-auth-core | tail -2'`,
				{ ...at, clear: true, shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION}   # auth-core comes with it` }
			);
			execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`);
			const { output } = await terminal(
				`docker run -d --rm --name ${CONTAINER} -p ${PORT}:${PORT} -v "${dir}":/w -w /w node:22 npm run dev > /dev/null ` +
					`&& for i in $(seq 1 90); do curl -sf ${LOCAL} > /dev/null && break; sleep 1; done ` +
					`&& docker logs ${CONTAINER} 2>&1 | grep -E "Local:" | sed 's/\\x1b\\[[0-9;]*m//g'`,
				{ ...at, shown: 'npm run dev' }
			);
			expect(output).toContain(`localhost:${PORT}`);
			await waitForUrl(LOCAL, 30_000);
		});

		await step('The owner of a workspace with no plan signs in and is asked to pick one: Free, or Premium at $5', async () => {
			await page.goto(`${LOCAL}/auth/login`);
			await expect(page.locator('#login-email')).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await demo.type(page.locator('#login-email'), email);
			await page.locator('#login-password').fill(password);
			await click(page.getByRole('button', { name: 'Sign in', exact: true }));
			await page.waitForURL((u) => u.pathname === '/subscription/plan', { timeout: 60_000 });
			await expect(page.locator('[data-bridge-plan-card]').filter({ hasText: 'Premium' })).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await show(page.locator('[data-bridge-plan-cards]'));
		});

		await step('Picking Free moves straight on to the success page, which shows Free', async () => {
			const free = page.locator('[data-bridge-plan-card]').filter({ hasText: 'Free' });
			await click(free.getByRole('button', { name: /Select free plan/ }));
			await page.waitForURL((u) => u.pathname === '/subscription/success', { timeout: 30_000 });
			const success = page.locator('[data-bridge-billing-route="success"]');
			await expect(success.locator('.bss-plan')).toHaveText('Free', { timeout: 30_000 });
			await showAddress(page);
			await show(success.locator('.bridge-subscription-status'));
		});

		await step('On the subscription page the current plan is Free, and Premium is offered to change to', async () => {
			await page.goto(`${LOCAL}/subscription`);
			const manage = page.locator('[data-bridge-billing-route="manage"]');
			await expect(manage.locator('.bss-plan')).toHaveText('Free', { timeout: 30_000 });
			await expect(page.locator('[data-bridge-plan-card]').filter({ hasText: 'Premium' })).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await show(page.locator('[data-bridge-plan-card]').filter({ hasText: 'Premium' }));
		});

		await step('They upgrade to Premium and pay in Stripe’s checkout (test mode on stage)', async () => {
			await click(page.locator('[data-bridge-plan-card]').filter({ hasText: 'Premium' }).locator('button').first());
			await page.waitForURL((u) => u.hostname.includes('stripe.com'), { timeout: 60_000 });
			const cardNumber = page.locator('#cardNumber, [data-testid="card-number-input"], input[name="cardNumber"]').first();
			await cardNumber.waitFor({ state: 'visible', timeout: 30_000 });
			await showAddress(page);
			await demo.type(cardNumber, '4242424242424242');
			await page.locator('#cardExpiry, [data-testid="card-expiry-input"], input[name="cardExpiry"]').first().fill('1234');
			await page.locator('#cardCvc, [data-testid="card-cvc-input"], input[name="cardCvc"]').first().fill('123');
			const name = page.locator('#billingName, input[name="billingName"]').first();
			if (await name.isVisible().catch(() => false)) await name.fill('Ada Lovelace');
			const zip = page.locator('#billingPostalCode, input[name="billingPostalCode"]').first();
			if (await zip.isVisible().catch(() => false)) await zip.fill('12345');
		});

		await step('Back on the app, the success page shows “Premium active” straight away, not “Subscription unavailable”', async () => {
			await click(page.locator('button[type="submit"], .SubmitButton').first());
			await page.waitForURL((u) => u.origin === LOCAL, { timeout: 90_000 });
			const success = page.locator('[data-bridge-billing-route="success"]');
			await expect(success).toBeVisible({ timeout: 60_000 });
			await expect(success.locator('.bridge-subscription-status')).toContainText('Premium', { timeout: 15_000 });
			await showAddress(page);
			await show(success.locator('.bridge-subscription-status'));
		});

		await step('A few seconds later, and after a reload, it still says Premium: the page never lost the plan', async () => {
			await page.waitForTimeout(5000);
			await page.reload();
			const success = page.locator('[data-bridge-billing-route="success"]');
			await expect(success.locator('.bridge-subscription-status')).toContainText('Premium', { timeout: 30_000 });
			expect(unavailable).toEqual([]);
			await showAddress(page);
			await show(success.locator('.bridge-subscription-status'));
		});
	} finally {
		execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`);
		execSync(`docker run --rm -v "${dir}":/w node:22 rm -rf /w/node_modules /w/.svelte-kit >/dev/null 2>&1 || true`);
		rmSync(dir, { recursive: true, force: true });
		await removeApp();
	}
});
