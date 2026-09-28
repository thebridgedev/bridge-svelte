import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-697 (milestone TBP-M35): counting once, where the click happens.
 *
 * The owner rule (2026-09-28): usage is counted once, where the action
 * happens. When the click stays in the browser, the browser counts it, which
 * is first-class (it trusts the browser). When the click calls the app's own
 * server, the backend handler counts it and the page only shows the number.
 *
 * A stage app sells a Free plan with 3 clicks (a counter, hard limit) and 100
 * exports. A fresh SvelteKit app from the published bridge-svelte beta (with
 * the auth-core beta, which the browser usage reporter needs) has a page whose
 * button calls nothing but `bridge.usage.report('clicks')`, wrapped in
 * `<QuotaGate>`, and shows `useQuota('clicks')`: each click moves "N of 3",
 * and at 3 the button is disabled with the upgrade prompt. No backend is
 * involved. A second page does it wrong on purpose: its Export button calls a
 * fresh NestJS backend (published bridge-nestjs beta) whose handler counts
 * exports with `@RequireQuota('exports')`, and also reports the export from
 * the browser. In development the plugin warns in the browser console that
 * 'exports' is counted twice; the warning is the real console output of the
 * demo's browser, shown in the terminal window.
 *
 * Setup is part of the file: the stage demo app is deleted and recreated
 * through the stage test endpoints (keyed by PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage, never printed). Tokens and the password are
 * masked. Both containers, the network, the scratch projects and the stage app
 * are removed at the end.
 *
 * Re-run (memory preflight first — this starts three containers, installs one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-M35 bridge-plugins/bridge-svelte/demos/counting-once-where-the-click-happens.demo.ts \
 *     --base-url http://localhost:5301 --title "15 · TBP-697 · Counting once, where the click happens"
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.6';
const NESTJS_VERSION = process.env.DEMO_NESTJS_VERSION ?? '0.8.0-beta.1';
const AUTH_CORE_VERSION = process.env.DEMO_AUTH_CORE_VERSION ?? '0.8.0-beta.3';
const DOMAIN = 'demo-count-once';
const OWNER = 'demo-count-once@example.com';
const PORT = 5301;
const LOCAL = `http://localhost:${PORT}`;
const WEB = 'demo-count-once-web';
const API = 'demo-count-once-api';
const NETWORK = 'demo-count-once';
const CLICK_LIMIT = 3;

function stageKey(): string {
	const line = readFileSync(join(API_DIR, 'config/.env.stage'), 'utf8')
		.split('\n')
		.find((l) => l.startsWith('PLAYWRIGHT_TEST_API_KEY='));
	const key = line?.slice('PLAYWRIGHT_TEST_API_KEY='.length).trim().replace(/^"|"$/g, '');
	if (!key) throw new Error('PLAYWRIGHT_TEST_API_KEY missing from bridge-api/config/.env.stage');
	return key;
}

const headers = () => ({ 'Content-Type': 'application/json', 'x-playwright-api-key': stageKey() });

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
const removeApp = () =>
	fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ domain: DOMAIN }) }).catch(() => {});

type Setup = { appId: string; tenantId: string; token: string; ownerPassword: string };

async function setup(): Promise<Setup> {
	const ownerPassword = `Demo-${Date.now()}-Aa1!`;
	await removeApp();
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', { domain: DOMAIN, appName: 'The Button', ownerEmail: OWNER, ownerPassword, appUrl: LOCAL });
	await post('configure-app', {
		appDomain: DOMAIN,
		allowedOrigins: [LOCAL],
		redirectUris: [`${LOCAL}/auth/oauth-callback`],
		defaultCallbackUri: `${LOCAL}/auth/oauth-callback`
	});
	for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: DOMAIN, key }).catch(() => undefined);
	await post('ensure-plan', { appDomain: DOMAIN, key: 'free', name: 'Free', trial: false, trialDays: 0, prices: [{ amount: 0, currency: 'USD', recurrenceInterval: 'month' }] });
	await post('ensure-plan', { appDomain: DOMAIN, key: 'pro', name: 'Pro', trial: false, trialDays: 0, prices: [{ amount: 9, currency: 'USD', recurrenceInterval: 'month' }] });
	const { token } = await post<{ token: string }>('generate-jwt', {
		appDomain: DOMAIN,
		privileges: ['AUTHENTICATED', 'USER_READ', 'USER_WRITE', 'TENANT_READ', 'TENANT_WRITE']
	});
	await json('/v1/account/payments/plan/free', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', 'x-api-key': token },
		body: JSON.stringify({
			quotas: [
				{ metric: 'clicks', limit: CLICK_LIMIT, policy: 'hard', kind: 'counter' },
				{ metric: 'exports', limit: 100, policy: 'hard', kind: 'counter' }
			]
		})
	});
	await post('set-tenant-plan', { appDomain: DOMAIN, tenantId: app.tenantId, planKey: 'free', currency: 'USD', recurrenceInterval: 'month' });
	return { appId: app.appId, tenantId: app.tenantId, token, ownerPassword };
}

// ── the backend: a fresh NestJS app ─────────────────────────────────────────

const CONTROLLER = `import { Controller, Post } from '@nestjs/common';
import { RequireQuota } from '@nebulr-group/bridge-nestjs';

@Controller('exports')
export class ExportsController {
  @Post()   // counts one export, and refuses with 402 at the plan's limit
  @RequireQuota('exports')
  create() { return { file: 'tickets.csv' }; }
}
`;

function writeBackend(dir: string, s: Setup) {
	const w = (path: string, text: string) => {
		mkdirSync(join(dir, path, '..'), { recursive: true });
		writeFileSync(join(dir, path), text);
	};
	w(
		'package.json',
		JSON.stringify(
			{
				name: 'helpdesk-api',
				private: true,
				scripts: { build: 'tsc', start: 'node dist/main.js' },
				dependencies: {
					'@nebulr-group/bridge-nestjs': NESTJS_VERSION,
					'@nebulr-group/bridge-auth-core': AUTH_CORE_VERSION,
					'@nestjs/common': '^11',
					'@nestjs/core': '^11',
					'@nestjs/platform-express': '^11',
					'reflect-metadata': '^0.2.2',
					rxjs: '^7.8.1'
				},
				devDependencies: { typescript: '^5.7.3', '@types/node': '^22', '@types/express': '^5' }
			},
			null,
			2
		)
	);
	w(
		'tsconfig.json',
		JSON.stringify(
			{
				compilerOptions: {
					module: 'commonjs',
					target: 'ES2021',
					outDir: './dist',
					rootDir: './src',
					experimentalDecorators: true,
					emitDecoratorMetadata: true,
					esModuleInterop: true,
					skipLibCheck: true,
					strictNullChecks: true
				},
				include: ['src/**/*']
			},
			null,
			2
		)
	);
	w('.env', `BRIDGE_APP_ID=${s.appId}\nBRIDGE_API_BASE_URL=${STAGE}\n`);
	w(
		'src/main.ts',
		`import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  await app.listen(3000);
  console.log('API listening on :3000');
}
bootstrap();
`
	);
	w(
		'src/app.module.ts',
		`import { Module } from '@nestjs/common';
import { BridgeModule } from '@nebulr-group/bridge-nestjs';
import { ExportsController } from './exports.controller';

@Module({
  imports: [BridgeModule.forRoot({ guard: { global: true, defaultAccess: 'protected' } })],
  controllers: [ExportsController],
})
export class AppModule {}
`
	);
	w('src/exports.controller.ts', CONTROLLER);
}

// ── the frontend: a fresh SvelteKit app ─────────────────────────────────────

/** The button counts in the browser: the click never reaches a server, so the browser is where it happens. */
const BUTTON = `<script lang="ts">
	import { bridge, useQuota, QuotaGate } from '@nebulr-group/bridge-svelte';

	const clicks = useQuota('clicks');

	function press() {
		bridge.usage.report('clicks'); // counted here, where the click happens
	}
</script>

<h1>The Button</h1>
<QuotaGate metric="clicks">
	<button onclick={press}>Click</button>
</QuotaGate>
{#if !clicks.loading}<p class="gauge">{clicks.used} of {clicks.limit} clicks used</p>{/if}
`;

/** Done wrong on purpose: the export calls the backend, which counts it, and the page reports it too. */
const EXPORT = `<script lang="ts">
	import { bridge, bridgeFetch, useQuota } from '@nebulr-group/bridge-svelte';

	const exports = useQuota('exports');

	async function exportTickets() {
		const res = await bridgeFetch('/api/exports', { method: 'POST' }); // the backend counts it
		if (res.ok) bridge.usage.report('exports'); // ...and so does the browser: twice
	}
</script>

<h1>Export</h1>
<button onclick={exportTickets}>Export tickets</button>
{#if !exports.loading}<p class="gauge">{exports.used} of {exports.limit} exports used</p>{/if}
`;

function writeFrontend(dir: string, appId: string) {
	const w = (path: string, text: string) => {
		mkdirSync(join(dir, path, '..'), { recursive: true });
		writeFileSync(join(dir, path), text);
	};
	w(
		'package.json',
		JSON.stringify(
			{
				name: 'the-button',
				private: true,
				type: 'module',
				scripts: { dev: `vite dev --host 0.0.0.0 --port ${PORT} --strictPort` },
				dependencies: { '@nebulr-group/bridge-svelte': SVELTE_VERSION, '@nebulr-group/bridge-auth-core': AUTH_CORE_VERSION },
				devDependencies: { '@sveltejs/kit': '^2', '@sveltejs/vite-plugin-svelte': '^5', svelte: '^5', vite: '^6' }
			},
			null,
			2
		)
	);
	// The app's own API answers on the app's own origin: Vite forwards /api to the backend container.
	w(
		'vite.config.js',
		`import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: { proxy: { '/api': { target: 'http://${API}:3000', rewrite: (p) => p.replace(/^\\/api/, '') } } }
});
`
	);
	w('svelte.config.js', 'export default { kit: {} };\n');
	w(
		'src/app.html',
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t\t<style>table{border-collapse:collapse;font-size:1.25rem}th,td{padding:.6rem 1.5rem;border-bottom:1px solid #e5e7eb;text-align:left}.on{color:#065f46}.off{color:#991b1b}button{padding:.8rem 2.2rem;border:0;border-radius:.5rem;background:#4f46e5;color:#fff;font-size:1.3rem;cursor:pointer}button:disabled{background:#9ca3af;cursor:not-allowed}.gauge{font-size:1.4rem;font-weight:600}.bridge-quota-gate-limit{margin-top:.75rem}</style>\n\t\t%sveltekit.head%\n\t</head>\n\t<body style="font-family: system-ui, sans-serif; margin: 72px 48px 48px">\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>\n'
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
	w('src/routes/+page.svelte', BUTTON);
	w('src/routes/export/+page.svelte', EXPORT);
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
		bar.textContent = location.origin + location.pathname;
		bar.setAttribute(
			'style',
			'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;padding:6px 16px;border-radius:999px;' +
				'background:#f1f3f5;border:1px solid #d0d5db;color:#1d1f24;font:500 14px/1.3 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)'
		);
		document.documentElement.appendChild(bar);
	});
}

const npmInstall = (dir: string) =>
	`set -o pipefail; docker run --rm -v "${dir}":/w -w /w -e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error -e NPM_CONFIG_FUND=false -e NPM_CONFIG_AUDIT=false node:22 npm install 2>&1 | tail -2`;

test('Counting once, where the click happens', async ({ demo }) => {
	test.setTimeout(14 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const s = await setup();
	const root = mkdtempSync(join(tmpdir(), 'the-button-'));
	const web = join(root, 'the-button');
	const api = join(root, 'the-button-api');
	writeFrontend(web, s.appId);
	writeBackend(api, s);
	const at = { cwd: web, promptDir: 'the-button', title: 'the-button — a fresh SvelteKit app', timeoutMs: 300_000, redact: [s.token, s.ownerPassword] };
	const atApi = { ...at, cwd: api, promptDir: 'the-button-api', title: 'the-button-api — a fresh NestJS app' };
	const consoleFile = join(root, 'console.txt');
	const warnings: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'warning' && m.text().includes('[bridge]')) warnings.push(m.text());
	});

	const cleanup = () => {
		execSync(`docker rm -f ${WEB} ${API} >/dev/null 2>&1 || true`);
		execSync(`docker network rm ${NETWORK} >/dev/null 2>&1 || true`);
	};

	try {
		await step('A page whose button reaches no server: the click is counted in the browser, where it happens', async () => {
			const { output } = await terminal('expand -t 2 src/routes/+page.svelte', { ...at, clear: true, shown: 'cat src/routes/+page.svelte' });
			expect(output).toContain("bridge.usage.report('clicks')");
			expect(output).not.toMatch(/fetch\(/);
		});

		await step('Install from the published packages and start it (and a small backend, used later)', async () => {
			cleanup();
			execSync(`docker network create ${NETWORK} >/dev/null`);
			await terminal(npmInstall(api), { ...atApi, clear: true, shown: `npm install @nebulr-group/bridge-nestjs@${NESTJS_VERSION}` });
			const started = await terminal(
				`docker run -d --rm --name ${API} --network ${NETWORK} --env-file .env -v "${api}":/w -w /w node:22 sh -c 'npm run build --silent && npm start --silent' > /dev/null ` +
					`&& for i in $(seq 1 120); do docker logs ${API} 2>&1 | grep -q 'listening' && break; sleep 1; done; docker logs ${API} 2>&1 | tail -2`,
				{ ...atApi, shown: 'npm run build && npm start' }
			);
			expect(started.output).toContain('API listening');
			await terminal(npmInstall(web), { ...at, shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION} @nebulr-group/bridge-auth-core@${AUTH_CORE_VERSION}` });
			const { output } = await terminal(
				`docker run -d --rm --name ${WEB} --network ${NETWORK} -p ${PORT}:${PORT} -v "${web}":/w -w /w node:22 npm run dev > /dev/null ` +
					`&& for i in $(seq 1 90); do curl -sf ${LOCAL} > /dev/null && break; sleep 1; done ` +
					`&& docker logs ${WEB} 2>&1 | grep -E "Local:" | sed 's/\\x1b\\[[0-9;]*m//g'`,
				{ ...at, shown: 'npm run dev' }
			);
			expect(output).toContain(`localhost:${PORT}`);
			await waitForUrl(LOCAL, 30_000);
		});

		const gauge = page.locator('p.gauge');
		const button = page.getByRole('button', { name: 'Click', exact: true });

		await step(`The owner of a Free workspace signs in. Their plan allows ${CLICK_LIMIT} clicks, and none are used`, async () => {
			await page.goto(`${LOCAL}/auth/login`);
			await expect(page.locator('#login-email')).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await demo.type(page.locator('#login-email'), OWNER);
			await page.locator('#login-password').fill(s.ownerPassword);
			await click(page.getByRole('button', { name: 'Sign in', exact: true }));
			await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });
			await expect(page.getByRole('heading', { name: 'The Button' })).toBeVisible({ timeout: 30_000 });
			await expect(gauge).toHaveText(`0 of ${CLICK_LIMIT} clicks used`, { timeout: 30_000 });
			await showAddress(page);
			await show(gauge);
		});

		await step('Each click is counted by Bridge from the browser alone, and the number on the page follows', async () => {
			for (let n = 1; n < CLICK_LIMIT; n++) {
				await click(button);
				await expect(gauge).toHaveText(`${n} of ${CLICK_LIMIT} clicks used`, { timeout: 45_000 });
			}
			await show(gauge);
		});

		await step(`The ${CLICK_LIMIT}rd click uses the last one: the button stops, with the upgrade prompt beside it`, async () => {
			await click(button);
			await expect(gauge).toHaveText(`${CLICK_LIMIT} of ${CLICK_LIMIT} clicks used`, { timeout: 45_000 });
			await expect(page.locator('[data-bridge-quota-gate]')).toHaveAttribute('data-state', 'at-limit', { timeout: 30_000 });
			await expect(button).toBeDisabled();
			await expect(page.locator('[data-bridge-quota-gate-limit]')).toContainText(`You've used all ${CLICK_LIMIT} clicks on your plan.`);
			await show(page.locator('[data-bridge-quota-gate-limit]'));
		});

		await step('Opening the page again, Bridge still says 3 of 3: the count lives in Bridge, not in the page', async () => {
			await page.reload();
			await expect(gauge).toHaveText(`${CLICK_LIMIT} of ${CLICK_LIMIT} clicks used`, { timeout: 30_000 });
			await expect(button).toBeDisabled({ timeout: 30_000 });
			await showAddress(page);
			await show(gauge);
		});

		await step('Done wrong on purpose: an Export button that calls the backend, which counts exports, and also reports the export from the browser', async () => {
			const { output } = await terminal("sed -n '/^<script/,/^<\\/script>/p' src/routes/export/+page.svelte | expand -t 2", {
				...at,
				clear: true,
				shown: 'cat src/routes/export/+page.svelte'
			});
			expect(output).toContain("bridgeFetch('/api/exports'");
			expect(output).toContain("bridge.usage.report('exports')");
			await terminal('cat src/exports.controller.ts', { ...atApi });
		});

		await step('One click, counted twice', async () => {
			await page.goto(`${LOCAL}/export`);
			await expect(gauge).toHaveText('0 of 100 exports used', { timeout: 30_000 });
			await showAddress(page);
			await click(page.getByRole('button', { name: 'Export tickets' }));
			await expect(gauge).toHaveText('2 of 100 exports used', { timeout: 45_000 });
			await show(gauge);
		});

		await step('In development, the plugin says so in the browser console, once, with the fix', async () => {
			await expect.poll(() => warnings.length, { timeout: 15_000 }).toBeGreaterThan(0);
			writeFileSync(consoleFile, warnings.map((w) => `⚠ ${w}`).join('\n') + '\n');
			const { output } = await terminal(`fold -s -w 110 "${consoleFile}"`, { ...at, clear: true, title: `DevTools console — ${LOCAL}/export`, promptDir: 'console', shown: '# the browser console' });
			expect(output).toContain("'exports' is counted twice");
			expect(output).not.toContain("'clicks'");
			expect(warnings).toHaveLength(1);
		});
	} finally {
		cleanup();
		execSync(`docker run --rm -v "${root}":/w node:22 rm -rf /w/the-button/node_modules /w/the-button/.svelte-kit /w/the-button-api/node_modules /w/the-button-api/dist >/dev/null 2>&1 || true`);
		rmSync(root, { recursive: true, force: true });
		await removeApp();
	}
});
