import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-756 (milestone TBP-M35): a feature that is off says why — not on the
 * plan, not allowed for this person, or switched off.
 *
 * A fresh SvelteKit app from the published bridge-svelte beta, on a stage app
 * that sells Free and Pro (Pro includes "Analytics"), with three flags:
 * `analytics` (the plan includes analytics), `manage-team` (the privilege to
 * change users, which Owner has and Member does not) and `export` (both at
 * once). Two routes are gated by those flags in `+layout.ts`, and the home page
 * renders the analytics feature twice: hidden with no fallback, and with the
 * opt-in `upgrade` word.
 *
 * For the Owner of a Free workspace: nothing opens by itself; the `upgrade`
 * prompt opens the upgrade dialog, which names the plan that includes the
 * feature; clicking into the gated route keeps them on their page with the
 * dialog; opening its address directly lands on the rule's page and opens the
 * dialog there. For a Member: the team page is "not allowed, ask an admin",
 * and no upgrade is offered. A fresh NestJS backend from the published
 * bridge-nestjs beta gates the same flags with `@RequireFlag`: 402 upgrade
 * required for a plan reason, 403 not permitted for a role or privilege
 * reason, 403 off for a switched-off flag, each naming the fix; a rule with
 * two conditions names the one that failed.
 *
 * Setup is part of the file: the stage demo app is deleted and recreated
 * through the stage test endpoints (keyed by PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage, never printed); the Member is invited with the
 * published CLI and given a password by the test endpoint. Tokens and
 * passwords are masked. Both containers, the scratch projects and the stage
 * app are removed at the end.
 *
 * Re-run (memory preflight first — this starts three containers, installs one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-M35 bridge-plugins/bridge-svelte/demos/a-feature-that-is-off-says-why.demo.ts \
 *     --base-url http://localhost:5299 --title "14 · TBP-756 · A feature that is off says why"
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.6';
const NESTJS_VERSION = process.env.DEMO_NESTJS_VERSION ?? '0.8.0-beta.1';
const AUTH_CORE_VERSION = process.env.DEMO_AUTH_CORE_VERSION ?? '0.8.0-beta.3';
const CLI_VERSION = process.env.DEMO_CLI_VERSION ?? '0.6.0-beta.7';
const DOMAIN = 'demo-feature-off-says-why';
const OWNER = 'demo-feature-off-says-why@example.com';
const MEMBER = 'demo-feature-off-says-why-member@example.com';
const PORT = 5299;
const API_PORT = 5300;
const LOCAL = `http://localhost:${PORT}`;
const BACKEND = `http://localhost:${API_PORT}`;
const WEB = 'demo-feature-off-says-why-web';
const API = 'demo-feature-off-says-why-api';

const PLAN_FEATURE = { attribute: 'bridge:billing.entitlement.analytics', operator: 'eq', values: [true] };
const CAN_CHANGE_USERS = { attribute: 'privileges', operator: 'contains', values: ['USER_WRITE'] };
const ruleOf = (...conditions: unknown[]) => ({ branches: [{ conditions, returnValue: true }], otherwiseValue: false, rolloutPct: 100 });
const FLAGS = [
	{ key: 'analytics', description: 'The analytics report: sold on Pro', state: 'on-with-rule', rule: ruleOf(PLAN_FEATURE) },
	{ key: 'manage-team', description: 'Team administration: people who can change users', state: 'on-with-rule', rule: ruleOf(CAN_CHANGE_USERS) },
	{ key: 'export', description: 'Export: on Pro, for people who can change users', state: 'on-with-rule', rule: ruleOf(CAN_CHANGE_USERS, PLAN_FEATURE) },
	{ key: 'beta-inbox', description: 'Switched off for everyone', state: 'off' }
];

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

/** Why Bridge says `flag` is off for an anonymous visitor (null when on or not served yet). */
async function flagReason(appId: string, flag: string): Promise<string | null> {
	const res = await fetch(`${STAGE}/cloud-views/flags/bulkEvaluate/${appId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
	if (!res.ok) return null;
	const body = (await res.json()) as { flags: Array<{ flag: string; evaluation?: { reason?: string } }> };
	return body.flags.find((f) => f.flag === flag)?.evaluation?.reason ?? null;
}

function bridge(args: string): string {
	return (
		`docker run --rm -e BRIDGE_API_KEY -e BRIDGE_BASE_URL=${STAGE} -e BRIDGE_NO_BANNER=true ` +
		`-e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error node:22 npx -y @nebulr-group/bridge-cli@${CLI_VERSION} ${args}`
	);
}

type Setup = { appId: string; tenantId: string; token: string; ownerPassword: string; memberPassword: string };

async function setup(): Promise<Setup> {
	const ownerPassword = `Demo-${Date.now()}-Aa1!`;
	const memberPassword = `Demo-${Date.now()}-Bb2!`;
	await removeApp();
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', { domain: DOMAIN, appName: 'Helpdesk', ownerEmail: OWNER, ownerPassword, appUrl: LOCAL });
	await post('configure-app', {
		appDomain: DOMAIN,
		allowedOrigins: [LOCAL],
		redirectUris: [`${LOCAL}/auth/oauth-callback`],
		defaultCallbackUri: `${LOCAL}/auth/oauth-callback`
	});
	for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: DOMAIN, key }).catch(() => undefined);
	await post('ensure-plan', { appDomain: DOMAIN, key: 'free', name: 'Free', trial: false, trialDays: 0, prices: [{ amount: 0, currency: 'USD', recurrenceInterval: 'month' }] });
	await post('ensure-plan', { appDomain: DOMAIN, key: 'pro', name: 'Pro', trial: false, trialDays: 0, prices: [{ amount: 29, currency: 'USD', recurrenceInterval: 'month' }] });
	await post('set-tenant-plan', { appDomain: DOMAIN, tenantId: app.tenantId, planKey: 'free', currency: 'USD', recurrenceInterval: 'month' });
	const { token } = await post<{ token: string }>('generate-jwt', {
		appDomain: DOMAIN,
		privileges: ['AUTHENTICATED', 'USER_READ', 'USER_WRITE', 'TENANT_READ', 'TENANT_WRITE']
	});
	const mgmt = { 'Content-Type': 'application/json', 'x-api-key': token };
	await json('/v1/account/payments/plan/pro', { method: 'PUT', headers: mgmt, body: JSON.stringify({ features: [{ key: 'analytics', name: 'Analytics' }] }) });
	for (const f of FLAGS) {
		await json('/v1/admin/flags/flag', {
			method: 'POST',
			headers: mgmt,
			body: JSON.stringify({ key: f.key, description: f.description, state: f.state, valueType: 'boolean', onValue: true, offValue: false, ...(f.rule ? { rule: f.rule } : {}) })
		});
	}
	// A teammate invited as Member, the role new apps give everyone after the first person (TBP-758).
	execSync(`${bridge(`user invite --email ${MEMBER} --role MEMBER --tenant-id ${app.tenantId}`)} > /dev/null`, { env: { ...process.env, BRIDGE_API_KEY: token } });
	// The invitation email would let them pick a password; the test endpoint sets one (for someone already in the workspace, only the password changes).
	const joined = await post<{ role: string }>('add-user-to-tenant', { workspaceId: app.appId, tenantId: app.tenantId, email: MEMBER, password: memberPassword, role: 'ADMIN' });
	expect(joined.role).toBe('MEMBER');
	// Bridge serves new rules once its flag cache has picked them up.
	await expect.poll(() => flagReason(app.appId, 'analytics'), { timeout: 120_000, intervals: [2000] }).toBe('plan');
	await expect.poll(() => flagReason(app.appId, 'manage-team'), { timeout: 120_000, intervals: [2000] }).toBe('permission');
	return { appId: app.appId, tenantId: app.tenantId, token, ownerPassword, memberPassword };
}

// ── the backend: a fresh NestJS app ─────────────────────────────────────────

const CONTROLLER = `import { Controller, Get, UseGuards } from '@nestjs/common';
import { BridgeFlagGuard, RequireFlag } from '@nebulr-group/bridge-nestjs/flags';

@Controller()
@UseGuards(BridgeFlagGuard)
export class ReportsController {
  @Get('analytics') @RequireFlag('analytics')
  analytics() { return { report: 'Tickets closed this week: 42' }; }

  @Get('team-admin') @RequireFlag('manage-team')
  teamAdmin() { return { people: 2 }; }

  @Get('export') @RequireFlag('export')
  export() { return { file: 'tickets.csv' }; }

  @Get('inbox') @RequireFlag('beta-inbox')
  inbox() { return { messages: 0 }; }
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
	w('.env', `BRIDGE_APP_ID=${s.appId}\nBRIDGE_API_BASE_URL=${STAGE}\nBRIDGE_API_KEY=${s.token}\n`);
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
import { BridgeFlagsModule } from '@nebulr-group/bridge-nestjs/flags';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    BridgeModule.forRoot({ guard: { global: true, defaultAccess: 'protected' } }),
    BridgeFlagsModule.forRoot({ apiBaseUrl: process.env.BRIDGE_API_BASE_URL!, apiKey: process.env.BRIDGE_API_KEY!, runtimeMode: 'pull' }),
  ],
  controllers: [ReportsController],
})
export class AppModule {}
`
	);
	w('src/reports.controller.ts', CONTROLLER);
}

// ── the frontend: a fresh SvelteKit app ─────────────────────────────────────

/** Route rules: two pages exist only while their flag is on; `redirectTo` is where a refused visitor goes. */
const LAYOUT_TS = `import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;
export const load = bridgeBootstrap({
	loginRoute: '/auth/login',
	rules: [
		{ match: new RegExp('^/auth($|/)'), public: true },
		{ match: '/analytics', featureFlag: 'analytics', redirectTo: '/' },
		{ match: '/team-admin', featureFlag: 'manage-team', redirectTo: '/' }
	],
	defaultAccess: 'protected'
});
`;

const HOME = `<script lang="ts">
	import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<h1>Helpdesk</h1>
<p><a href="/analytics">Analytics</a> · <a href="/team-admin">Team admin</a></p>

<h2>This week</h2>
<!-- Hidden when off, and nothing else happens -->
<FeatureFlag key="analytics" defaultValue={false}>
	{#snippet children()}<p data-testid="chart">Analytics chart</p>{/snippet}
</FeatureFlag>

<!-- Opt-in: when the plan is the reason, an upgrade prompt takes its place -->
<FeatureFlag key="analytics" defaultValue={false} upgrade>
	{#snippet children()}<p data-testid="report">Analytics report</p>{/snippet}
</FeatureFlag>

<h2>Team</h2>
<FeatureFlag key="manage-team" defaultValue={false}>
	{#snippet children()}<p data-testid="team-on">Manage your team</p>{/snippet}
	{#snippet fallback(_v, { reason })}
		{#if reason === 'permission'}<p data-testid="team-denied">Managing the team isn't part of your role. Ask a workspace admin for access.</p>{/if}
	{/snippet}
</FeatureFlag>
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
	w('vite.config.js', "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({ plugins: [sveltekit()] });\n");
	w('svelte.config.js', 'export default { kit: {} };\n');
	w(
		'src/app.html',
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t\t<style>table{border-collapse:collapse;font-size:1.25rem}th,td{padding:.6rem 1.5rem;border-bottom:1px solid #e5e7eb;text-align:left}.on{color:#065f46}.off{color:#991b1b}button{padding:.5rem 1rem;border:0;border-radius:.4rem;background:#4f46e5;color:#fff;font-size:1rem;cursor:pointer}</style>\n\t\t%sveltekit.head%\n\t</head>\n\t<body style="font-family: system-ui, sans-serif; margin: 72px 48px 48px">\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>\n'
	);
	w('.env', `VITE_BRIDGE_APP_ID=${appId}\nVITE_BRIDGE_API_BASE_URL=${STAGE}\n`);
	w('src/routes/+layout.ts', LAYOUT_TS);
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
	w('src/routes/+page.svelte', HOME);
	w('src/routes/analytics/+page.svelte', '<h1>Analytics</h1>\n<p data-testid="analytics-page">Tickets closed this week: 42</p>\n');
	w('src/routes/team-admin/+page.svelte', '<h1>Team admin</h1>\n<p data-testid="team-admin-page">2 people</p>\n');
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

/** One line per endpoint: status, then the refusal's code and fix (or the body). $USER_TOKEN is the signed-in person's own token. */
const ASK_BACKEND =
	`for p in $PATHS; do printf '%-13s ' "/$p"; curl -s -w ' %{http_code}' -H "Authorization: Bearer $USER_TOKEN" ${BACKEND}/$p ` +
	`| sed -E 's/^(.*) ([0-9]{3})$/\\2 \\1/; s/"message":"[^"]*",?//; s/"statusCode":[0-9]+,?//; s/,}/}/'; echo; done`;

test('A feature that is off says why: not on the plan, not allowed for this person, or switched off', async ({ demo }) => {
	test.setTimeout(14 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const s = await setup();
	const root = mkdtempSync(join(tmpdir(), 'helpdesk-'));
	const web = join(root, 'helpdesk');
	const api = join(root, 'helpdesk-api');
	writeFrontend(web, s.appId);
	writeBackend(api, s);
	const redact = [s.token, s.ownerPassword, s.memberPassword];
	const at = { cwd: web, promptDir: 'helpdesk', title: 'helpdesk — a fresh SvelteKit app', timeoutMs: 300_000, redact, env: { BRIDGE_API_KEY: s.token } };
	const atApi = { ...at, cwd: api, promptDir: 'helpdesk-api', title: 'helpdesk-api — a fresh NestJS app' };
	const featureDialog = page.locator('dialog[data-bridge-upgrade-dialog][data-variant="feature"]');
	const anyOpenDialog = page.locator('dialog[data-bridge-upgrade-dialog][open]');
	const prompt = page.locator('[data-bridge-feature-upgrade="analytics"]');

	const cleanup = () => execSync(`docker rm -f ${WEB} ${API} >/dev/null 2>&1 || true`);

	/** Sign in in the browser, and return the access token the app now holds for this person. */
	async function signIn(email: string, password: string): Promise<string> {
		await page.evaluate(() => localStorage.clear()).catch(() => undefined);
		await page.goto(`${LOCAL}/auth/login`);
		await expect(page.locator('#login-email')).toBeVisible({ timeout: 30_000 });
		await showAddress(page);
		await demo.type(page.locator('#login-email'), email);
		await page.locator('#login-password').fill(password);
		await click(page.getByRole('button', { name: 'Sign in', exact: true }));
		await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });
		await expect(page.getByRole('heading', { name: 'Helpdesk' })).toBeVisible({ timeout: 30_000 });
		const raw = await page.evaluate((key) => localStorage.getItem(key), `bridge_tokens:${s.appId}`);
		const accessToken = raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : undefined;
		if (!accessToken) throw new Error('no access token in the browser after sign-in');
		return accessToken;
	}

	try {
		await step('The app gates two pages with flags in one file: analytics (sold on Pro) and team admin (people who can change users)', async () => {
			const { output } = await terminal("sed -n '/rules:/,/],/p' src/routes/+layout.ts", { ...at, clear: true, shown: 'cat src/routes/+layout.ts' });
			expect(output).toContain("featureFlag: 'analytics'");
			expect(output).toContain("featureFlag: 'manage-team'");
		});

		await step('The home page shows analytics twice: once hidden when off, once with the opt-in upgrade word', async () => {
			const { output } = await terminal("sed -n '/<h2>This week/,$p' src/routes/+page.svelte | expand -t 2", { ...at, clear: true, shown: 'cat src/routes/+page.svelte' });
			expect(output).toContain('defaultValue={false} upgrade>');
		});

		await step('Install both from the published packages and start them', async () => {
			cleanup();
			await terminal(npmInstall(api), { ...atApi, clear: true, shown: `npm install @nebulr-group/bridge-nestjs@${NESTJS_VERSION}` });
			const started = await terminal(
				`docker run -d --rm --name ${API} -p ${API_PORT}:3000 --env-file .env -v "${api}":/w -w /w node:22 sh -c 'npm run build --silent && npm start --silent' > /dev/null ` +
					`&& for i in $(seq 1 120); do docker logs ${API} 2>&1 | grep -q 'listening' && break; sleep 1; done; docker logs ${API} 2>&1 | tail -2`,
				{ ...atApi, shown: 'npm run build && npm start' }
			);
			expect(started.output).toContain('API listening');
			await terminal(npmInstall(web), { ...at, shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION} @nebulr-group/bridge-auth-core@${AUTH_CORE_VERSION}` });
			const { output } = await terminal(
				`docker run -d --rm --name ${WEB} -p ${PORT}:${PORT} -v "${web}":/w -w /w node:22 npm run dev > /dev/null ` +
					`&& for i in $(seq 1 90); do curl -sf ${LOCAL} > /dev/null && break; sleep 1; done ` +
					`&& docker logs ${WEB} 2>&1 | grep -E "Local:" | sed 's/\\x1b\\[[0-9;]*m//g'`,
				{ ...at, shown: 'npm run dev' }
			);
			expect(output).toContain(`localhost:${PORT}`);
			await waitForUrl(LOCAL, 30_000);
		});

		const ownerToken = await signIn(OWNER, s.ownerPassword);
		redact.push(ownerToken);

		await step('The Owner of a Free workspace opens the app. Nothing pops up: the hidden copy is simply not there, the opt-in copy offers the upgrade', async () => {
			await expect(prompt).toBeVisible({ timeout: 30_000 });
			await expect(page.getByTestId('chart')).toHaveCount(0);
			await expect(page.getByTestId('report')).toHaveCount(0);
			await expect(anyOpenDialog).toHaveCount(0);
			await showAddress(page);
			await show(prompt);
		});

		await step('Clicking the prompt opens the upgrade dialog: this feature isn’t on your plan, and Pro includes it', async () => {
			await click(prompt);
			await expect(featureDialog).toBeVisible({ timeout: 15_000 });
			await expect(featureDialog).toHaveAttribute('data-feature', 'analytics');
			await expect(featureDialog).toContainText("This feature isn't on your plan");
			await expect(featureDialog.locator('[data-bridge-upgrade-dialog-included-in]')).toHaveText('Included in: Pro');
			await show(featureDialog.locator('[data-bridge-upgrade-dialog-included-in]'));
		});

		await step('Clicking into the analytics page keeps them where they were, with the same dialog, instead of a silent bounce', async () => {
			await click(featureDialog.getByRole('button', { name: 'Not now' }));
			await expect(anyOpenDialog).toHaveCount(0);
			await click(page.getByRole('link', { name: 'Analytics' }));
			await expect(featureDialog).toBeVisible({ timeout: 30_000 });
			await expect(page).toHaveURL(`${LOCAL}/`);
			await expect(page.getByTestId('analytics-page')).toHaveCount(0);
			await showAddress(page);
			await show(featureDialog);
		});

		await step('Opening the analytics address directly lands on the page the rule names, and the dialog explains why', async () => {
			await page.goto(`${LOCAL}/analytics`);
			await page.waitForURL(`${LOCAL}/`, { timeout: 30_000 });
			await expect(featureDialog).toBeVisible({ timeout: 30_000 });
			await expect(page.getByTestId('analytics-page')).toHaveCount(0);
			await showAddress(page);
			await show(featureDialog);
		});

		await step('On the backend the same flag answers 402 “upgrade required” with where to upgrade. A rule with two conditions names the one that failed: the plan', async () => {
			const { output } = await terminal(ASK_BACKEND, {
				...at,
				clear: true,
				env: { ...at.env, USER_TOKEN: ownerToken, PATHS: 'analytics export' },
				shown: 'curl -H "Authorization: Bearer $OWNER_TOKEN" localhost:5300/{analytics,export}'
			});
			expect(output).toMatch(/\/analytics\s+402 .*"code":"FEATURE_NOT_IN_PLAN".*"fix":"\/subscription"/);
			expect(output).toMatch(/\/export\s+402 .*"code":"FEATURE_NOT_IN_PLAN".*"reason":"plan"/);
		});

		const memberToken = await signIn(MEMBER, s.memberPassword);
		redact.push(memberToken);

		await step('A Member of the same workspace: team admin is not allowed for them, so the page says to ask an admin, and offers no upgrade', async () => {
			const denied = page.getByTestId('team-denied');
			await expect(denied).toBeVisible({ timeout: 30_000 });
			await click(page.getByRole('link', { name: 'Team admin' }));
			await expect(page).toHaveURL(`${LOCAL}/`, { timeout: 30_000 });
			await expect(page.getByTestId('team-admin-page')).toHaveCount(0);
			await expect(anyOpenDialog).toHaveCount(0);
			await showAddress(page);
			await show(denied);
		});

		await step('The backend says the same: 403 not permitted, with the fix “ask a workspace admin”. A flag switched off for everyone is simply 403 off', async () => {
			const { output } = await terminal(ASK_BACKEND, {
				...at,
				clear: true,
				env: { ...at.env, USER_TOKEN: memberToken, PATHS: 'team-admin inbox' },
				shown: 'curl -H "Authorization: Bearer $MEMBER_TOKEN" localhost:5300/{team-admin,inbox}'
			});
			expect(output).toMatch(/\/team-admin\s+403 .*"code":"FEATURE_NOT_PERMITTED".*"fix":"Ask a workspace admin for access\."/);
			expect(output).toMatch(/\/inbox\s+403 .*"code":"FEATURE_OFF"/);
		});
	} finally {
		cleanup();
		execSync(`docker run --rm -v "${root}":/w node:22 rm -rf /w/helpdesk/node_modules /w/helpdesk/.svelte-kit /w/helpdesk-api/node_modules /w/helpdesk-api/dist >/dev/null 2>&1 || true`);
		rmSync(root, { recursive: true, force: true });
		await removeApp();
	}
});
