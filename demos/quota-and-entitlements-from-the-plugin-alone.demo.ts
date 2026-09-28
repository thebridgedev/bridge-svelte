import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-697 (milestone TBP-M35): plan limits and entitlements in the page, from
 * the Svelte plugin alone.
 *
 * The same two fresh apps as the TBP-703 demo, each from the published betas,
 * each in a throwaway node:22 container on one docker network: a NestJS
 * backend (@nebulr-group/bridge-nestjs) whose create-ticket handler carries
 * `@RequireQuota('tickets', { current })`, and a SvelteKit frontend whose Vite
 * dev server forwards /api to it.
 *
 * On stage the workspace is on a "Free" plan: 3 tickets (a gauge the backend
 * keeps), 10 drafts (a gauge the browser reports), and a "reports" allowance,
 * so `reports` is an entitlement the plan grants; `analytics` is not on it.
 *
 * The home page imports only from @nebulr-group/bridge-svelte: `useQuota`
 * shows "N of 3 tickets" (and a "checking" line, never a made-up 0, until
 * Bridge answers), `$entitlements.can(...)` switches markup by plan, and
 * `bridgeFetch` creates tickets through the app's own backend with the
 * signed-in user's token. A drafts page reports its own count with
 * `bridge.usage.set('drafts', n)` — self-reported, from the browser — and the
 * gauge on the page follows.
 *
 * `bridge.usage.set` needs @nebulr-group/bridge-auth-core 0.8.0-beta or later;
 * with bridge-svelte alone npm resolves auth-core 0.7.x (the peer range
 * allows it), so the app installs auth-core 0.8.0-beta.1 explicitly.
 *
 * Setup is part of the file and starts clean every run: the stage demo app is
 * deleted and recreated through the stage test endpoints (keyed by
 * PLAYWRIGHT_TEST_API_KEY from bridge-api/config/.env.stage, never printed).
 * Both containers, the network, the scratch projects and the stage app are
 * removed at the end.
 *
 * Re-run (memory preflight first — this starts four containers, installs one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-697 bridge-plugins/bridge-svelte/demos/quota-and-entitlements-from-the-plugin-alone.demo.ts --base-url http://localhost:5294
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.6';
const NESTJS_VERSION = process.env.DEMO_NESTJS_VERSION ?? '0.8.0-beta.1';
const AUTH_CORE_VERSION = process.env.DEMO_AUTH_CORE_VERSION ?? '0.8.0-beta.3';
const DOMAIN = 'demo-quota-from-plugin';
const OWNER = 'demo-quota-from-plugin@example.com';
const PORT = 5294;
const LOCAL = `http://localhost:${PORT}`;
const NETWORK = 'demo-quota-from-plugin';
const WEB = 'demo-quota-from-plugin-web';
const API = 'demo-quota-from-plugin-api';
const TICKET_LIMIT = 3;
const DRAFT_LIMIT = 10;

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

async function setup(): Promise<{ appId: string; password: string }> {
	const password = `Demo-${Date.now()}-Aa1!`;
	await removeApp();
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', {
		domain: DOMAIN,
		appName: 'Helpdesk',
		ownerEmail: OWNER,
		ownerPassword: password,
		appUrl: LOCAL
	});
	await post('configure-app', {
		appDomain: DOMAIN,
		allowedOrigins: [LOCAL],
		redirectUris: [`${LOCAL}/auth/oauth-callback`],
		defaultCallbackUri: `${LOCAL}/auth/oauth-callback`
	});
	// The seeded demo plans go; the app sells exactly the plan below.
	for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: DOMAIN, key }).catch(() => {});
	await post('ensure-plan', { appDomain: DOMAIN, key: 'free', name: 'Free', trial: false, trialDays: 0, prices: [{ amount: 0, currency: 'USD', recurrenceInterval: 'month' }] });
	const { token: apiToken } = await post<{ token: string }>('generate-jwt', {
		appDomain: DOMAIN,
		privileges: ['AUTHENTICATED', 'USER_READ', 'USER_WRITE', 'TENANT_READ', 'TENANT_WRITE']
	});
	await json('/v1/account/payments/plan/free', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', 'x-api-key': apiToken },
		body: JSON.stringify({
			quotas: [
				{ metric: 'tickets', limit: TICKET_LIMIT, policy: 'hard', kind: 'gauge' },
				{ metric: 'drafts', limit: DRAFT_LIMIT, policy: 'hard', kind: 'gauge' },
				{ metric: 'reports', limit: 10, policy: 'hard', kind: 'counter' }
			]
		})
	});
	await post('set-tenant-plan', { appDomain: DOMAIN, tenantId: app.tenantId, planKey: 'free', currency: 'USD', recurrenceInterval: 'month' });
	return { appId: app.appId, password };
}

// ── the backend: a fresh NestJS app ─────────────────────────────────────────

const CONTROLLER = `import { Controller, Post } from '@nestjs/common';
import { BridgeTenant, BridgeUser, CurrentTenant, CurrentUser, RequireQuota } from '@nebulr-group/bridge-nestjs';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(readonly tickets: TicketsService) {}

  @Post()
  @RequireQuota('tickets', { current: (t, self: TicketsController) => self.tickets.list(t.id).length })
  create(@CurrentTenant() t: BridgeTenant, @CurrentUser() u: BridgeUser) {
    return { ...this.tickets.create(t.id), by: u.email };
  }
}
`;

function writeBackend(dir: string, appId: string) {
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
	w('.env', `BRIDGE_APP_ID=${appId}\nBRIDGE_API_BASE_URL=${STAGE}\n`);
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
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [BridgeModule.forRoot({ guard: { global: true, defaultAccess: 'protected' } })],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class AppModule {}
`
	);
	w('src/tickets.controller.ts', CONTROLLER);
	w(
		'src/tickets.service.ts',
		`import { Injectable } from '@nestjs/common';

/** The app's own tickets. In a real app, the database. */
@Injectable()
export class TicketsService {
  private readonly byTenant = new Map<string, { id: string; title: string }[]>();
  private seq = 0;

  list(tenantId: string) { return this.byTenant.get(tenantId) ?? []; }

  create(tenantId: string) {
    const ticket = { id: \`T-\${++this.seq}\`, title: \`Customer request #\${this.seq}\` };
    this.byTenant.set(tenantId, [...this.list(tenantId), ticket]);
    return ticket;
  }
}
`
	);
}

// ── the frontend: a fresh SvelteKit app ─────────────────────────────────────

/** The home page: every import is from @nebulr-group/bridge-svelte. */
const HOME = `<script lang="ts">
  import { bridgeFetch, entitlements, useQuota } from '@nebulr-group/bridge-svelte';

  const tickets = useQuota('tickets');
  let last = $state<{ id: string; by: string } | null>(null);

  async function newTicket() {
    const res = await bridgeFetch('/api/tickets', { method: 'POST' });
    if (res.ok) last = await res.json();
  }
</script>

<h1>Helpdesk</h1>
{#if tickets.loading}<p class="gauge">Checking your plan…</p>
{:else}<p class="gauge">{tickets.used} of {tickets.limit} tickets</p>{/if}
<button onclick={newTicket}>New ticket</button>
{#if last}<p>{last.id}, created by our backend for {last.by}</p>{/if}

{#if $entitlements.can('reports')}<p class="feature">Weekly report: ready to download</p>{/if}
{#if $entitlements.ready && !$entitlements.can('analytics')}<p class="locked">Analytics is on the Pro plan</p>{/if}
`;

/** A page with no backend behind it: the browser says how many drafts exist. */
const DRAFTS = `<script lang="ts">
  import { bridge, useQuota } from '@nebulr-group/bridge-svelte';

  const drafts = useQuota('drafts');
  let onThisDevice = 0;

  async function saveDraft() {
    onThisDevice += 1;
    await bridge.usage.set('drafts', onThisDevice); // self-reported by the browser
  }
</script>

<h1>Drafts</h1>
{#if !drafts.loading}<p class="gauge">{drafts.used} of {drafts.limit} drafts</p>{/if}
<button onclick={saveDraft}>Save a draft</button>
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
				name: 'helpdesk',
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
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t\t<style>button{padding:.5rem 1rem;border:0;border-radius:.4rem;background:#4f46e5;color:#fff;font-size:1rem;cursor:pointer}button:disabled{background:#9ca3af;cursor:not-allowed}li{margin:.3rem 0}.feature{color:#065f46}.locked{color:#991b1b}.gauge{font-size:1.25rem;font-weight:600}</style>\n\t\t%sveltekit.head%\n\t</head>\n\t<body style="font-family: system-ui, sans-serif; margin: 72px 48px 48px">\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>\n'
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
		w('src/routes/auth/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeAuthRoutes />\n");
	w('src/routes/subscription/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeBillingRoutes />\n");
	w('src/routes/+page.svelte', HOME);
	w('src/routes/drafts/+page.svelte', DRAFTS);
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

test('Plan limits and entitlements in the page, from the Svelte plugin alone', async ({ demo }) => {
	test.setTimeout(12 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const s = await setup();
	const root = mkdtempSync(join(tmpdir(), 'helpdesk-'));
	const web = join(root, 'helpdesk');
	const api = join(root, 'helpdesk-api');
	writeFrontend(web, s.appId);
	writeBackend(api, s.appId);
	const at = { cwd: web, promptDir: 'helpdesk', title: 'helpdesk — a fresh SvelteKit app', timeoutMs: 300_000, redact: [s.password] };
	const atApi = { ...at, cwd: api, promptDir: 'helpdesk-api', title: 'helpdesk-api — a fresh NestJS app' };
	const gauge = page.locator('p.gauge');

	const cleanup = () => {
		execSync(`docker rm -f ${WEB} ${API} >/dev/null 2>&1 || true`);
		execSync(`docker network rm ${NETWORK} >/dev/null 2>&1 || true`);
	};

	try {
		await step('The page imports only from the Svelte plugin: live plan numbers, the plan’s features, and calls to its own backend', async () => {
			const { output } = await terminal('expand -t 2 src/routes/+page.svelte', { ...at, clear: true, shown: 'cat src/routes/+page.svelte' });
			const imports = output.split('\n').filter((l) => /^\s*import /.test(l));
			expect(imports).toEqual(["  import { bridgeFetch, entitlements, useQuota } from '@nebulr-group/bridge-svelte';"]);
			expect(output).toContain("useQuota('tickets')");
			expect(output).toContain("$entitlements.can('reports')");
		});

		await step('Install and start both. The frontend adds the auth-core beta, which the self-reported drafts count needs', async () => {
			cleanup();
			execSync(`docker network create ${NETWORK} >/dev/null`);
			await terminal(npmInstall(api), { ...atApi, clear: true, shown: `npm install @nebulr-group/bridge-nestjs@${NESTJS_VERSION}` });
			const started = await terminal(
				`docker run -d --rm --name ${API} --network ${NETWORK} --env-file .env -v "${api}":/w -w /w node:22 sh -c 'npm run build --silent && npm start --silent' > /dev/null ` +
					`&& for i in $(seq 1 120); do docker logs ${API} 2>&1 | grep -q 'listening' && break; sleep 1; done; docker logs ${API} 2>&1 | tail -2`,
				{ ...atApi, shown: 'npm run build && npm start' }
			);
			expect(started.output).toContain('API listening');
			await terminal(npmInstall(web), {
				...at,
				shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION} @nebulr-group/bridge-auth-core@${AUTH_CORE_VERSION}`
			});
			const { output } = await terminal(
				`docker run -d --name ${WEB} --network ${NETWORK} -p ${PORT}:${PORT} -v "${web}":/w -w /w node:22 npm run dev > /dev/null ` +
					`&& for i in $(seq 1 90); do curl -sf ${LOCAL} > /dev/null && break; sleep 1; done ` +
					`&& docker logs ${WEB} 2>&1 | grep -E "Local:" | sed 's/\\x1b\\[[0-9;]*m//g'`,
				{ ...at, shown: 'npm run dev' }
			);
			expect(output).toContain(`localhost:${PORT}`);
			await waitForUrl(LOCAL, 30_000);
		});

		await step(`The workspace owner signs in. Their workspace is on the Free plan: ${TICKET_LIMIT} tickets, weekly reports, no analytics`, async () => {
			await page.goto(`${LOCAL}/auth/login`);
			await expect(page.locator('#login-email')).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await demo.type(page.locator('#login-email'), OWNER);
			await page.locator('#login-password').fill(s.password);
			await click(page.getByRole('button', { name: 'Sign in', exact: true }));
			await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });
			await expect(gauge).toHaveText(`0 of ${TICKET_LIMIT} tickets`, { timeout: 30_000 });
			await showAddress(page);
			await show(gauge);
		});

		await step('Each new ticket goes through the app’s own backend with the user’s token, and the count on the page follows', async () => {
			const create = page.getByRole('button', { name: 'New ticket' });
			for (let i = 1; i <= 2; i++) {
				const answered = page.waitForResponse((r) => r.url().endsWith('/api/tickets') && r.request().method() === 'POST');
				await click(create);
				const res = await answered;
				expect(res.status()).toBe(201);
				expect(await res.request().headerValue('authorization')).toMatch(/^Bearer /);
				await expect(page.getByText(`T-${i}, created by our backend for ${OWNER}`)).toBeVisible({ timeout: 15_000 });
			}
			await expect(gauge).toHaveText(`2 of ${TICKET_LIMIT} tickets`, { timeout: 30_000 });
			await show(gauge);
		});

		await step('Opening the page again: until Bridge answers, the page says it is checking, never a made-up 0 (Bridge’s answer is held back here so the moment can be seen)', async () => {
			// The request goes out as normal; only its answer reaches the page 4 s late.
			await page.route('**/usage/quota/tickets', async (route) => {
				const response = await route.fetch();
				await new Promise((r) => setTimeout(r, 4000));
				await route.fulfill({ response });
			});
			await page.goto(LOCAL);
			await expect(gauge).toHaveText('Checking your plan…', { timeout: 15_000 });
			await expect(page.getByText(/\b0 of/)).toHaveCount(0);
			await showAddress(page);
			await show(gauge);
		});

		await step(`Then the real number: 2 of ${TICKET_LIMIT} tickets`, async () => {
			await expect(gauge).toHaveText(`2 of ${TICKET_LIMIT} tickets`, { timeout: 30_000 });
			await page.unroute('**/usage/quota/tickets');
			await show(gauge);
		});

		await step('Markup follows the plan: the weekly report the Free plan includes shows, and analytics, which it does not, is replaced by a note that it is on the Pro plan', async () => {
			await expect(page.getByText('Weekly report: ready to download')).toBeVisible({ timeout: 30_000 });
			await expect(page.getByText('Analytics is on the Pro plan')).toBeVisible();
			await show(page.getByText('Analytics is on the Pro plan'));
		});

		await step('A page with no backend reports its own count: saving a draft tells Bridge how many exist. This number is self-reported by the browser', async () => {
			const { output } = await terminal('head -11 src/routes/drafts/+page.svelte', {
				...at,
				clear: true,
				shown: 'head -11 src/routes/drafts/+page.svelte'
			});
			expect(output).toContain("bridge.usage.set('drafts', onThisDevice)");
		});

		await step('Each saved draft moves the drafts gauge on the page', async () => {
			await page.goto(`${LOCAL}/drafts`);
			await expect(gauge).toHaveText(`0 of ${DRAFT_LIMIT} drafts`, { timeout: 30_000 });
			await showAddress(page);
			const save = page.getByRole('button', { name: 'Save a draft' });
			for (let i = 1; i <= 3; i++) {
				const stored = page.waitForResponse((r) => r.url().includes('/usage/gauge/drafts') && r.request().method() === 'PUT');
				await click(save);
				expect((await stored).ok()).toBe(true);
			}
			await expect(gauge).toHaveText(`3 of ${DRAFT_LIMIT} drafts`, { timeout: 30_000 });
			await show(gauge);
		});
	} finally {
		cleanup();
		execSync(`docker run --rm -v "${root}":/w node:22 rm -rf /w/helpdesk/node_modules /w/helpdesk/.svelte-kit /w/helpdesk-api/node_modules /w/helpdesk-api/dist >/dev/null 2>&1 || true`);
		rmSync(root, { recursive: true, force: true });
		await removeApp();
	}
});
