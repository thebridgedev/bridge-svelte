import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-702 (milestone TBP-M35): subscription and paywall pages the app never
 * has to write.
 *
 * A fresh SvelteKit app using the published @nebulr-group/bridge-svelte beta
 * has ONE billing file, `src/routes/subscription/[...bridge]/+page.svelte` =
 * `<BridgeBillingRoutes />`, and no billing configuration at all. On stage, a
 * workspace with no plan is sent to /subscription/plan before any page renders,
 * pays for a plan through a real Stripe test-mode checkout, lands on
 * /subscription/success, and /subscription then shows the current plan. A
 * checkout Bridge cannot confirm lands on /subscription/error. Finally the same
 * app is pointed at a stage app that has no plans, and its plan-less workspace
 * is left alone.
 *
 * Setup is part of the file: both stage demo apps are deleted and recreated
 * through the stage test endpoints (keyed by PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage, never printed). The paid app gets Stripe test
 * keys (STRIPE_TEST_PK / STRIPE_TEST_SK from bridge-svelte's
 * config/.env.test.local, the same keys its e2e billing specs use; never
 * printed) and one "Pro" plan; the seeded demo plans are removed from both
 * apps. The container, the scratch project and both stage apps are removed at
 * the end.
 *
 * Re-run (memory preflight first — this starts two containers, one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-702 bridge-plugins/bridge-svelte/demos/subscription-pages-the-app-never-writes.demo.ts --base-url http://localhost:5292
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_ENV = process.env.DEMO_SVELTE_TEST_ENV ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-plugins/bridge-svelte/config/.env.test.local';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.1';
const PAID = 'demo-billing-routes';
const FREE = 'demo-billing-routes-noplans';
const PORT = 5292;
const LOCAL = `http://localhost:${PORT}`;
const CONTAINER = 'demo-bridge-billing-routes';

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
async function json<T>(path: string, init: RequestInit): Promise<T> {
	let res = await fetch(`${STAGE}${path}`, init);
	if (!res.ok) {
		await new Promise((r) => setTimeout(r, 3000));
		res = await fetch(`${STAGE}${path}`, init);
	}
	if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}: ${await res.text()}`);
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

const post = <T>(path: string, body: unknown) => json<T>(`/account/test/playwright/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
const removeApp = (domain: string) =>
	fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ domain }) }).catch(() => {});

type StageApp = { appId: string; tenantId: string; email: string; password: string };

/** A clean stage app whose owner's workspace has no plan, with the seeded demo plans removed. */
async function stageApp(domain: string, name: string, config: Record<string, unknown>): Promise<StageApp> {
	const email = `${domain}@example.com`;
	const password = `Demo-${Date.now()}-Aa1!`;
	await removeApp(domain);
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', { domain, appName: name, ownerEmail: email, ownerPassword: password, appUrl: LOCAL });
	await post('configure-app', {
		appDomain: domain,
		allowedOrigins: [LOCAL],
		redirectUris: [`${LOCAL}/auth/oauth-callback`],
		defaultCallbackUri: `${LOCAL}/auth/oauth-callback`,
		paymentsAutoRedirect: true,
		...config
	});
	const cleared = await post<{ shouldSelectPlan: boolean }>('clear-tenant-plan', { appDomain: domain, tenantId: app.tenantId });
	expect(cleared.shouldSelectPlan).toBe(true);
	for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: domain, key });
	return { appId: app.appId, tenantId: app.tenantId, email, password };
}

const ONE_FILE = `<script lang="ts">
	import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
`;

/** A fresh SvelteKit app: the scaffolding any `sv create` gives, plus Bridge. */
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
	w('src/routes/+page.svelte', '<h1>Dashboard</h1>\n<p>The app itself. <a href="/subscription">Subscription</a></p>\n');
	w('src/routes/auth/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeAuthRoutes />\n");
	w('src/routes/subscription/[...bridge]/+page.svelte', ONE_FILE);
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

/** Records whether the app's own dashboard heading ever reached the page. */
async function watchForDashboard(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { __dashboardRendered?: boolean };
		w.__dashboardRendered = false;
		new MutationObserver(() => {
			for (const h of document.querySelectorAll('h1')) if (h.textContent === 'Dashboard') w.__dashboardRendered = true;
		}).observe(document, { childList: true, subtree: true });
	});
}

// Stripe's checkout page forbids inline styles; without this the caption and the address bar vanish there.
test.use({ bypassCSP: true });

test('Subscription and paywall pages the app never has to write', async ({ demo }) => {
	test.setTimeout(12 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const stripe = { pk: envValue(SVELTE_ENV, 'STRIPE_TEST_PK'), sk: envValue(SVELTE_ENV, 'STRIPE_TEST_SK') };
	const paid = await stageApp(PAID, 'Billing pages demo', { stripeEnabled: true, stripePublicKey: stripe.pk, stripeSecretKey: stripe.sk, currency: 'USD' });
	await post('ensure-plan', {
		appDomain: PAID,
		key: 'pro',
		name: 'Pro',
		description: 'Everything in the demo app',
		trial: false,
		trialDays: 0,
		prices: [{ amount: 29, currency: 'USD', recurrenceInterval: 'month' }]
	});
	const free = await stageApp(FREE, 'App without plans demo', { stripeEnabled: false });

	const dir = mkdtempSync(join(tmpdir(), 'my-app-'));
	writeProject(dir, paid.appId);
	const at = { cwd: dir, promptDir: 'my-app', title: 'my-app — a fresh SvelteKit app', timeoutMs: 300_000, redact: [stripe.pk, stripe.sk] };

	const fillLogin = async (who: StageApp) => {
		await page.goto(`${LOCAL}/auth/login`);
		await expect(page.locator('#login-email')).toBeVisible({ timeout: 30_000 });
		await showAddress(page);
		await demo.type(page.locator('#login-email'), who.email);
		await page.locator('#login-password').fill(who.password);
	};
	const submitLogin = async () => {
		await click(page.getByRole('button', { name: 'Sign in', exact: true }));
		await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 30_000 });
	};

	try {
		await step('The subscription page, the paywall and the checkout return pages are ONE file, with no billing settings anywhere', async () => {
			const { output } = await terminal(`find src/routes -name '*.svelte' | sort && cat 'src/routes/subscription/[...bridge]/+page.svelte'`, {
				...at,
				clear: true
			});
			expect(output).toContain('<BridgeBillingRoutes />');
			const layout = readFileSync(join(dir, 'src/routes/+layout.ts'), 'utf8');
			expect(layout).not.toContain('billing');
		});

		await step('Install the published package and start the app', async () => {
			await terminal(
				`set -o pipefail; docker run --rm -v "${dir}":/w -w /w -e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error -e NPM_CONFIG_FUND=false -e NPM_CONFIG_AUDIT=false node:22 npm install 2>&1 | tail -2`,
				{ ...at, clear: true, shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION}` }
			);
			execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`);
			const { output } = await terminal(
				`docker run -d --rm --name ${CONTAINER} -p ${PORT}:${PORT} -v "${dir}":/w -w /w node:22 npm run dev > /dev/null ` +
					`&& for i in $(seq 1 90); do curl -sf ${LOCAL} > /dev/null && break; sleep 1; done ` +
					`&& docker logs ${CONTAINER} 2>&1 | grep -E "Local:|ready in" | sed 's/\\x1b\\[[0-9;]*m//g'`,
				{ ...at, shown: 'npm run dev' }
			);
			expect(output).toContain(`localhost:${PORT}`);
			await waitForUrl(LOCAL, 30_000);
		});

		await step("The owner of a workspace that hasn't picked a plan yet signs in (the app sells one plan, Pro)", async () => {
			await watchForDashboard(page);
			await fillLogin(paid);
		});

		await step('Signing in, and opening the app, lands on /subscription/plan before any page of the app renders', async () => {
			await submitLogin();
			await page.waitForURL((u) => u.pathname === '/subscription/plan', { timeout: 30_000 });
			await page.goto(`${LOCAL}/`, { waitUntil: 'commit' });
			await page.waitForURL((u) => u.pathname === '/subscription/plan', { timeout: 30_000 });
			const card = page.locator('[data-bridge-billing-route="plan"] [data-bridge-plan-card]').filter({ hasText: 'Pro' });
			await expect(card).toBeVisible({ timeout: 30_000 });
			expect(await page.evaluate(() => (window as unknown as { __dashboardRendered?: boolean }).__dashboardRendered)).toBe(false);
			await showAddress(page);
			await show(card);
		});

		await step("Choosing Pro opens Stripe's checkout (test mode on stage)", async () => {
			const card = page.locator('[data-bridge-plan-card]').filter({ hasText: 'Pro' });
			await click(card.locator('button').first());
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

		await step('After paying, Stripe sends them back to /subscription/success, which shows the plan they just bought', async () => {
			await click(page.locator('button[type="submit"], .SubmitButton').first());
			await page.waitForURL((u) => u.origin === LOCAL, { timeout: 90_000 });
			const success = page.locator('[data-bridge-billing-route="success"]');
			await expect(success).toBeVisible({ timeout: 60_000 });
			await expect(success.locator('.bss-plan')).toHaveText('Pro', { timeout: 60_000 });
			await showAddress(page);
			await show(success.getByRole('heading', { name: "You're all set" }));
		});

		await step('/subscription shows the current plan, a button to manage billing, and the plans to change to', async () => {
			await page.goto(`${LOCAL}/subscription`);
			const manage = page.locator('[data-bridge-billing-route="manage"]');
			await expect(manage.locator('.bss-plan')).toHaveText('Pro', { timeout: 30_000 });
			await expect(manage.locator('[data-bridge-plan-selector]')).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await show(manage.locator('.bss-plan'));
		});

		await step('With a plan, the app itself opens', async () => {
			await page.goto(`${LOCAL}/`);
			await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
			expect(new URL(page.url()).pathname).toBe('/');
			await showAddress(page);
			await show(page.getByRole('heading', { name: 'Dashboard' }));
		});

		await step("If Stripe sends someone back with a payment Bridge can't confirm, they land on /subscription/error, a real page", async () => {
			const back = encodeURIComponent('/subscription/success');
			await page.goto(`${LOCAL}/auth/oauth-callback?stripe_success=1&session_id=cs_test_not_a_real_session&redirect=${back}`);
			await page.waitForURL((u) => u.pathname === '/subscription/error', { timeout: 60_000 });
			const error = page.locator('[data-bridge-billing-route="error"]');
			await expect(error.getByRole('heading', { name: "We couldn't confirm your payment" })).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await show(error.getByRole('link', { name: 'Back to subscription' }));
		});

		await step('Now the same app is pointed at a Bridge app that sells no plans at all', async () => {
			await page.goto('about:blank'); // the dev server restarts when .env changes
			execSync(`docker exec ${CONTAINER} sed -i 's/^VITE_BRIDGE_APP_ID=.*/VITE_BRIDGE_APP_ID=${free.appId}/' /w/.env`);
			const { output } = await terminal('cat .env', { ...at, clear: true });
			expect(output).toContain(`VITE_BRIDGE_APP_ID=${free.appId}`);
			await waitForUrl(LOCAL, 60_000);
			await page.waitForTimeout(3000);
		});

		await step("Its owner's workspace has no plan either, but nobody is sent to a paywall: the app just opens", async () => {
			// A different Bridge app: drop the first app's session from this browser.
			await page.goto(`${LOCAL}/auth/login`);
			await page.evaluate(() => localStorage.clear());
			await fillLogin(free);
			await submitLogin();
			await page.goto(`${LOCAL}/`);
			await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
			await page.waitForTimeout(2000);
			expect(new URL(page.url()).pathname).toBe('/');
			await showAddress(page);
			await show(page.getByRole('heading', { name: 'Dashboard' }));
		});
	} finally {
		execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`);
		execSync(`docker run --rm -v "${dir}":/w node:22 rm -rf /w/node_modules /w/.svelte-kit >/dev/null 2>&1 || true`);
		rmSync(dir, { recursive: true, force: true });
		await removeApp(PAID);
		await removeApp(FREE);
	}
});
