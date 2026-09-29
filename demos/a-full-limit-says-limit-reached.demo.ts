import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-697 (milestone TBP-M35): at exactly a hard limit the quota banner says
 * the limit is reached, not that it is being approached.
 *
 * The owner's run on stage showed "approaching its clicks cap" at 2 of 2 on a
 * hard quota: the server answers `critical` from 95% and has no reached state
 * for hard quotas, and the banner compared used > limit. On bridge-svelte
 * 0.9.0-beta.8 a hard quota at used >= limit reads "limit reached".
 *
 * A stage app sells a Free plan with 2 clicks (a counter, hard limit). A
 * fresh SvelteKit app on the published plugin has a page with
 * `<BridgeQuotaBanner metric="clicks" />` and a button that reports a click.
 * The owner clicks twice; the banner reads "clicks limit reached", and still
 * does after a reload.
 *
 * Setup is part of the file: the stage app is deleted and recreated through
 * the stage test endpoints (PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage, never printed). The containers, the scratch
 * project and the stage app are removed at the end.
 *
 * Re-run (memory preflight first):
 *   ~/Workflows/bin/run-demo.sh TBP-697 bridge-plugins/bridge-svelte/demos/a-full-limit-says-limit-reached.demo.ts --base-url http://localhost:5292
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.8';
const DOMAIN = 'demo-limit-reached-banner';
const OWNER = `${DOMAIN}@example.com`;
const PORT = 5292;
const LOCAL = `http://localhost:${PORT}`;
const WEB = 'demo-limit-reached-banner-web';

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
	if (res.status >= 500) {
		await new Promise((r) => setTimeout(r, 3000));
		res = await fetch(`${STAGE}${path}`, init);
	}
	if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}: ${await res.text()}`);
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}
const post = <T>(path: string, body: unknown) => json<T>(`/account/test/playwright/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
const removeApp = () => fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ domain: DOMAIN }) }).catch(() => {});

const CLICKS_PAGE = `<script lang="ts">
	import { bridge, useQuota, QuotaGate, BridgeQuotaBanner } from '@nebulr-group/bridge-svelte';

	const clicks = useQuota('clicks');
</script>

<BridgeQuotaBanner metric="clicks" />
<h1>The Button</h1>
<QuotaGate metric="clicks">
	<button onclick={() => bridge.usage.report('clicks')}>Click</button>
</QuotaGate>
{#if !clicks.loading}<p class="gauge">{clicks.used} of {clicks.limit} clicks used</p>{/if}
`;

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
	w('src/routes/+page.svelte', '<h1>Dashboard</h1>\n<p><a href="/button">The Button</a></p>\n');
	w('src/routes/auth/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeAuthRoutes />\n");
	w('src/routes/subscription/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeBillingRoutes />\n");
	w('src/routes/button/+page.svelte', CLICKS_PAGE);
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

async function showAddress(page: Page) {
	await page.evaluate(() => {
		document.getElementById('__demo_addr')?.remove();
		const bar = document.createElement('div');
		bar.id = '__demo_addr';
		bar.textContent = location.origin + location.pathname;
		bar.setAttribute(
			'style',
			'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;padding:6px 16px;border-radius:999px;' +
				'background:#f1f3f5;border:1px solid #d0d5db;color:#1d1f24;font:500 14px/1.3 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)'
		);
		document.documentElement.appendChild(bar);
	});
}

test('At the limit, the banner says the limit is reached', async ({ demo }) => {
	test.setTimeout(10 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const password = `Demo-${Date.now()}-Aa1!`;

	await removeApp();
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', { domain: DOMAIN, appName: 'Limit banner demo', ownerEmail: OWNER, ownerPassword: password, appUrl: LOCAL });
	const dir = mkdtempSync(join(tmpdir(), 'my-app-'));
	const at = { cwd: dir, promptDir: 'my-app', title: 'my-app — a fresh SvelteKit app', redact: [password], timeoutMs: 300_000 };

	try {
		await post('configure-app', { appDomain: DOMAIN, allowedOrigins: [LOCAL], redirectUris: [`${LOCAL}/auth/oauth-callback`], defaultCallbackUri: `${LOCAL}/auth/oauth-callback` });
		for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: DOMAIN, key }).catch(() => {});
		await post('ensure-plan', { appDomain: DOMAIN, key: 'free', name: 'Free', description: 'Free', trial: false, trialDays: 0, prices: [{ amount: 0, currency: 'USD', recurrenceInterval: 'month' }] });
		await post('set-tenant-plan', { appDomain: DOMAIN, tenantId: app.tenantId, planKey: 'free', currency: 'USD', recurrenceInterval: 'month' });
		const { token } = await post<{ token: string }>('generate-jwt', { appDomain: DOMAIN, privileges: ['AUTHENTICATED', 'TENANT_READ', 'TENANT_WRITE'] });
		await json('/v1/account/payments/plan/free', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', 'x-api-key': token },
			body: JSON.stringify({ quotas: [{ metric: 'clicks', limit: 2, policy: 'hard', kind: 'counter' }] })
		});
		writeProject(dir, app.appId);
		execSync(`docker rm -f ${WEB} >/dev/null 2>&1 || true`);

		await step('The Free plan allows 2 clicks. The page has the plugin’s quota banner and a button that counts a click', async () => {
			const { output } = await terminal(`cat src/routes/button/+page.svelte`, { ...at, clear: true });
			expect(output).toContain('<BridgeQuotaBanner metric="clicks" />');
			await terminal(
				`set -o pipefail; docker run --rm -v "${dir}":/w -w /w -e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error -e NPM_CONFIG_FUND=false -e NPM_CONFIG_AUDIT=false node:22 npm install 2>&1 | tail -1`,
				{ ...at, shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION}` }
			);
			const { output: dev } = await terminal(
				`docker run -d --rm --name ${WEB} -p ${PORT}:${PORT} -v "${dir}":/w -w /w node:22 npm run dev > /dev/null ` +
					`&& for i in $(seq 1 90); do curl -sf ${LOCAL} > /dev/null && break; sleep 1; done ` +
					`&& docker logs ${WEB} 2>&1 | grep -E "Local:" | sed 's/\\x1b\\[[0-9;]*m//g'`,
				{ ...at, shown: 'npm run dev' }
			);
			expect(dev).toContain(`localhost:${PORT}`);
			await waitForUrl(LOCAL, 30_000);
		});

		const gauge = page.locator('p.gauge');
		const banner = page.locator('.bridge-quota-banner');
		const button = page.getByRole('button', { name: 'Click', exact: true });
		await step('The owner signs in and opens the page: 0 of 2 clicks used, no banner', async () => {
			await page.goto(`${LOCAL}/auth/login`);
			await expect(page.locator('#login-email')).toBeVisible({ timeout: 30_000 });
			await page.locator('#login-email').fill(OWNER);
			await page.locator('#login-password').fill(password);
			await page.getByRole('button', { name: 'Sign in', exact: true }).click();
			await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 60_000 });
			await page.goto(`${LOCAL}/button`);
			await expect(gauge).toHaveText('0 of 2 clicks used', { timeout: 30_000 });
			await expect(banner).toHaveCount(0);
			await showAddress(page);
			await show(gauge);
		});

		await step('One click: 1 of 2 used', async () => {
			await click(button);
			await expect(gauge).toHaveText('1 of 2 clicks used', { timeout: 45_000 });
		});

		await step('The second click uses the last one. At 2 of 2 the banner says “clicks limit reached”, not “approaching”', async () => {
			await click(button);
			await expect(gauge).toHaveText('2 of 2 clicks used', { timeout: 45_000 });
			await expect(banner.locator('.bqb-title')).toHaveText('clicks limit reached', { timeout: 45_000 });
			await expect(banner).not.toContainText('approaching');
			await expect(banner.locator('.bqb-body')).toContainText("You've used all 2 on your plan.");
			await showAddress(page);
			await show(banner);
		});

		await step('After a reload, the same: the page reads the limit as reached, and the button is off', async () => {
			await page.reload();
			await expect(gauge).toHaveText('2 of 2 clicks used', { timeout: 30_000 });
			await expect(banner.locator('.bqb-title')).toHaveText('clicks limit reached', { timeout: 30_000 });
			await expect(button).toBeDisabled();
			await showAddress(page);
			await show(banner);
		});
	} finally {
		execSync(`docker rm -f ${WEB} >/dev/null 2>&1 || true`);
		execSync(`docker run --rm -v "${dir}":/w node:22 rm -rf /w/node_modules /w/.svelte-kit >/dev/null 2>&1 || true`);
		rmSync(dir, { recursive: true, force: true });
		await removeApp();
	}
});
