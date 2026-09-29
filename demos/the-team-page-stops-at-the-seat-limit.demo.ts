import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-763 (milestone TBP-M35): seats are a plan limit the app names, counted
 * by Bridge from membership, and the built-in team page stops at it.
 *
 * A stage app sells a Free plan whose `seats` limit is 2: a hard gauge with
 * `source: membership`, set with the published CLI beta. Bridge answers
 * `GET /usage/quota/seats` with the workspace's active members (pending
 * invites included), and refuses a report of that number. A fresh SvelteKit
 * app on the published plugin has a team page that is one line,
 * `<TeamManagementPanel seatsMetric="seats" />`. The owner invites one
 * teammate; at 2 of 2 the Invite button is disabled with the upgrade line.
 * Disabling the teammate frees the seat and the button comes back.
 *
 * Setup is part of the file: the stage app is deleted and recreated through
 * the stage test endpoints (PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage, never printed); an API token for the CLI and
 * the owner's sign-in token for the usage API only live in env and are
 * masked. Containers (CLI, install, dev server), the scratch project and the
 * stage app are removed at the end.
 *
 * Re-run (memory preflight first):
 *   ~/Workflows/bin/run-demo.sh TBP-763 bridge-plugins/bridge-svelte/demos/the-team-page-stops-at-the-seat-limit.demo.ts --base-url http://localhost:5292
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.8';
const CLI_VERSION = process.env.DEMO_CLI_VERSION ?? '0.6.0-beta.8';
const DOMAIN = 'demo-team-seat-limit';
const OWNER = `${DOMAIN}@example.com`;
const TEAMMATE = 'sam@example.com';
const PORT = 5292;
const LOCAL = `http://localhost:${PORT}`;
const WEB = 'demo-team-seat-limit-web';
const CLI = 'demo-team-seat-limit-cli';

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

const TEAM_PAGE = `<script lang="ts">
	import { TeamManagementPanel } from '@nebulr-group/bridge-svelte';
</script>

<TeamManagementPanel seatsMetric="seats" />
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
	w('src/routes/+page.svelte', '<h1>Dashboard</h1>\n<p><a href="/team">Team</a></p>\n');
	w('src/routes/auth/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeAuthRoutes />\n");
	w('src/routes/subscription/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeBillingRoutes />\n");
	w('src/routes/team/+page.svelte', TEAM_PAGE);
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

test('The team page stops at the plan’s seat limit, and the seat count follows the team', async ({ demo }) => {
	test.setTimeout(12 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const password = `Demo-${Date.now()}-Aa1!`;

	await removeApp();
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', { domain: DOMAIN, appName: 'Team seats demo', ownerEmail: OWNER, ownerPassword: password, appUrl: LOCAL });
	const dir = mkdtempSync(join(tmpdir(), 'my-app-'));
	const secrets: string[] = [password];
	let apiToken = '';

	/** The owner's own sign-in token, the way the SDK gets one, for the usage API. */
	const userToken = async (): Promise<string> => {
		const h = { 'content-type': 'application/json', origin: LOCAL };
		const auth = await json<{ session: string; tenantUsers: Array<{ id: string }> }>('/auth/authenticate', {
			method: 'POST',
			headers: h,
			body: JSON.stringify({ mode: 'sdk', appId: app.appId, username: OWNER, password })
		});
		const { access_token } = await json<{ access_token: string }>('/auth/token/direct', {
			method: 'POST',
			headers: h,
			body: JSON.stringify({ mode: 'sdk', appId: app.appId, session: auth.session, tenantUserId: auth.tenantUsers[0].id })
		});
		secrets.push(access_token);
		return access_token;
	};
	const at = (env: Record<string, string> = {}) => ({ cwd: dir, promptDir: 'my-app', title: 'my-app — Bridge stage', env, redact: secrets, timeoutMs: 300_000 });
	const bridge = (args: string) => `docker exec -e BRIDGE_API_KEY="$BRIDGE_API_KEY" -e BRIDGE_TENANT_ID="$BRIDGE_TENANT_ID" ${CLI} bridge ${args}`;
	const seats = async (clear = false) =>
		terminal(`curl -s ${STAGE}/v1/usage/quota/seats -H "Authorization: Bearer $USER_TOKEN" | jq -c '{metric, used, limit, remaining, source}'`, {
			...at({ USER_TOKEN: await userToken() }),
			clear,
			shown: `curl ${STAGE}/v1/usage/quota/seats`
		});

	try {
		await post('configure-app', { appDomain: DOMAIN, allowedOrigins: [LOCAL], redirectUris: [`${LOCAL}/auth/oauth-callback`], defaultCallbackUri: `${LOCAL}/auth/oauth-callback` });
		for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: DOMAIN, key }).catch(() => {});
		await post('ensure-plan', { appDomain: DOMAIN, key: 'free', name: 'Free', description: 'Free', trial: false, trialDays: 0, prices: [{ amount: 0, currency: 'USD', recurrenceInterval: 'month' }] });
		await post('set-tenant-plan', { appDomain: DOMAIN, tenantId: app.tenantId, planKey: 'free', currency: 'USD', recurrenceInterval: 'month' });
		({ token: apiToken } = await post<{ token: string }>('generate-jwt', { appDomain: DOMAIN, privileges: ['AUTHENTICATED', 'USER_READ', 'USER_WRITE', 'TENANT_READ', 'TENANT_WRITE'] }));
		secrets.push(apiToken);
		writeProject(dir, app.appId);
		execSync(`docker rm -f ${CLI} ${WEB} >/dev/null 2>&1 || true`);
		execSync(
			`docker run -d --rm --name ${CLI} -e BRIDGE_BASE_URL=${STAGE} -e BRIDGE_NO_BANNER=true -e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error node:22 sleep infinity >/dev/null && ` +
				`docker exec ${CLI} npm i -g @nebulr-group/bridge-cli@${CLI_VERSION} >/dev/null 2>&1`
		);
		const cliEnv = { BRIDGE_API_KEY: apiToken, BRIDGE_TENANT_ID: app.tenantId };

		await step('The Free plan gets a seat limit of 2. “seats” is just the name this app picked; Bridge counts it from the workspace’s members', async () => {
			const { output } = await terminal(`${bridge('plan quota set free --metric seats --limit 2 --policy hard --kind gauge --source membership')} | jq -c '.data.quotas[]'`, {
				...at(cliEnv),
				clear: true,
				shown: 'bridge plan quota set free --metric seats --limit 2 --policy hard --kind gauge --source membership'
			});
			expect(output).toContain('"source":"membership"');
		});

		await step('The workspace has one member, its owner: 1 of 2 seats used', async () => {
			const { output } = await seats();
			expect(output).toContain('"used":1');
			expect(output).toContain('"limit":2');
		});

		await step('The app’s whole team page is one line: the built-in panel, told the name of the seat limit', async () => {
			const { output } = await terminal(`cat src/routes/team/+page.svelte`, { ...at(), clear: true });
			expect(output).toContain('<TeamManagementPanel seatsMetric="seats" />');
			await terminal(
				`set -o pipefail; docker run --rm -v "${dir}":/w -w /w -e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error -e NPM_CONFIG_FUND=false -e NPM_CONFIG_AUDIT=false node:22 npm install 2>&1 | tail -1`,
				{ ...at(), shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION}` }
			);
			const { output: dev } = await terminal(
				`docker run -d --rm --name ${WEB} -p ${PORT}:${PORT} -v "${dir}":/w -w /w node:22 npm run dev > /dev/null ` +
					`&& for i in $(seq 1 90); do curl -sf ${LOCAL} > /dev/null && break; sleep 1; done ` +
					`&& docker logs ${WEB} 2>&1 | grep -E "Local:" | sed 's/\\x1b\\[[0-9;]*m//g'`,
				{ ...at(), shown: 'npm run dev' }
			);
			expect(dev).toContain(`localhost:${PORT}`);
			await waitForUrl(LOCAL, 30_000);
		});

		const addMember = page.getByRole('button', { name: 'Add Member', exact: true });
		await step('The owner opens the team page: one member, and a seat left, so Add Member is available', async () => {
			await page.goto(`${LOCAL}/auth/login`);
			await expect(page.locator('#login-email')).toBeVisible({ timeout: 30_000 });
			await page.locator('#login-email').fill(OWNER);
			await page.locator('#login-password').fill(password);
			await page.getByRole('button', { name: 'Sign in', exact: true }).click();
			await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 60_000 });
			await page.goto(`${LOCAL}/team`);
			await expect(page.locator('.bridge-team-table')).toContainText(OWNER, { timeout: 30_000 });
			await expect(addMember).toBeEnabled({ timeout: 30_000 });
			await showAddress(page);
			await show(addMember);
		});

		await step(`They invite ${TEAMMATE}: the invite takes the second seat`, async () => {
			await click(addMember);
			await demo.type(page.locator('#bridge-add-emails'), TEAMMATE);
			await click(page.getByRole('button', { name: 'Add Members', exact: true }));
			await expect(page.locator('.bridge-team-table')).toContainText(TEAMMATE, { timeout: 30_000 });
		});

		await step('At 2 of 2, Add Member is switched off, with a line saying why and a link to upgrade: a third person cannot be added here', async () => {
			await expect(addMember).toBeDisabled({ timeout: 30_000 });
			const line = page.locator('[data-bridge-quota-gate-limit]').first();
			await expect(line).toContainText('All 2 seats on your plan are taken (pending invites count).');
			await expect(line.getByRole('link', { name: 'Upgrade' })).toBeVisible();
			await showAddress(page);
			await show(line);
		});

		await step('Bridge’s count agrees: 2 of 2 used, the pending invite included', async () => {
			const { output } = await seats(true);
			expect(output).toContain('"used":2');
			expect(output).toContain('"remaining":0');
		});

		await step('The app cannot report or overwrite that number: Bridge refuses, and says to leave the count to it', async () => {
			const { output } = await terminal(
				`curl -s -X PUT ${STAGE}/v1/usage/gauge/seats -H "Authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' -d '{"value":0}' | jq -r '"\\(.statusCode) \\(.message)"' | fold -s -w 116`,
				{ ...at({ USER_TOKEN: await userToken() }), shown: `curl -X PUT ${STAGE}/v1/usage/gauge/seats -d '{"value":0}'` }
			);
			expect(output).toContain('400');
			expect(output).toContain('cannot be reported or set');
		});

		await step(`${TEAMMATE} is disabled, and the seat is free again: 1 of 2`, async () => {
			await terminal(`${bridge(`user update --email ${TEAMMATE} --enabled false`)} | jq -c '.data | {email, enabled}'`, {
				...at(cliEnv),
				clear: true,
				shown: `bridge user update --email ${TEAMMATE} --enabled false`
			});
			const { output } = await seats();
			expect(output).toContain('"used":1');
		});

		await step('On the team page, Add Member is available again', async () => {
			await page.goto(`${LOCAL}/team`);
			await expect(page.locator('.bridge-team-table')).toContainText(TEAMMATE, { timeout: 30_000 });
			await expect(addMember).toBeEnabled({ timeout: 30_000 });
			await showAddress(page);
			await show(addMember);
		});
	} finally {
		execSync(`docker rm -f ${WEB} ${CLI} >/dev/null 2>&1 || true`);
		execSync(`docker run --rm -v "${dir}":/w node:22 rm -rf /w/node_modules /w/.svelte-kit >/dev/null 2>&1 || true`);
		rmSync(dir, { recursive: true, force: true });
		await removeApp();
	}
});
