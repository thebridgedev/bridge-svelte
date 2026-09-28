import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * TBP-695 (milestone TBP-M35): Bridge starts in a SvelteKit app from one line.
 *
 * A fresh SvelteKit app using the published @nebulr-group/bridge-svelte beta
 * carries only two env vars, a one-line `load` in +layout.ts and a wrapper in
 * +layout.svelte. It is installed and served from a node:22 container, then a
 * browser visits it: a protected page sends the visitor to stage's hosted
 * sign-in page (the hosted address follows VITE_BRIDGE_API_BASE_URL, so no
 * third variable), and the public home page renders once Bridge is ready.
 *
 * Setup is part of the file: the stage demo app is deleted and recreated
 * through the stage test endpoints (keyed by PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage, never printed) with the local URL registered
 * as an allowed origin and callback. The container and the scratch project
 * (with its node_modules) are removed at the end.
 *
 * Re-run (memory preflight first — this starts two containers, one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-695 bridge-plugins/bridge-svelte/demos/bridge-starts-from-one-line.demo.ts --base-url http://localhost:5290
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.6';
const DOMAIN = 'demo-one-line-bootstrap';
const PORT = 5290;
const LOCAL = `http://localhost:${PORT}`;
const CONTAINER = 'demo-bridge-one-line';

function stageKey(): string {
	const line = readFileSync(join(API_DIR, 'config/.env.stage'), 'utf8')
		.split('\n')
		.find((l) => l.startsWith('PLAYWRIGHT_TEST_API_KEY='));
	const key = line?.slice('PLAYWRIGHT_TEST_API_KEY='.length).trim().replace(/^"|"$/g, '');
	if (!key) throw new Error('PLAYWRIGHT_TEST_API_KEY missing from bridge-api/config/.env.stage');
	return key;
}

/** Stage Lambdas answer a cold first call with a 5xx now and then; retry once. */
async function json<T>(path: string, init: RequestInit): Promise<T> {
	let res = await fetch(`${STAGE}${path}`, init);
	if (!res.ok) {
		await new Promise((r) => setTimeout(r, 3000));
		res = await fetch(`${STAGE}${path}`, init);
	}
	if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}: ${await res.text()}`);
	return (await res.json()) as T;
}

async function stageApp(): Promise<string> {
	const headers = { 'Content-Type': 'application/json', 'x-playwright-api-key': stageKey() };
	await fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers, body: JSON.stringify({ domain: DOMAIN }) });
	const app = await json<{ appId: string }>('/account/test/playwright/setup-test-app', {
		method: 'POST',
		headers,
		body: JSON.stringify({ domain: DOMAIN, appName: 'One-line bootstrap demo', ownerEmail: 'demo-one-line-bootstrap@example.com', appUrl: LOCAL })
	});
	await json('/account/test/playwright/configure-app', {
		method: 'POST',
		headers,
		body: JSON.stringify({
			appDomain: DOMAIN,
			allowedOrigins: [LOCAL],
			redirectUris: [`${LOCAL}/auth/oauth-callback`],
			defaultCallbackUri: `${LOCAL}/auth/oauth-callback`
		})
	});
	return app.appId;
}

/** A fresh SvelteKit app: the scaffolding any `sv create` gives, plus the three Bridge files. */
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
				dependencies: { '@nebulr-group/bridge-svelte': SVELTE_VERSION },
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
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t\t%sveltekit.head%\n\t</head>\n\t<body style="font-family: system-ui, sans-serif; margin: 48px">\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>\n'
	);

	// The three files the demo is about.
	w('.env', `VITE_BRIDGE_APP_ID=${appId}\nVITE_BRIDGE_API_BASE_URL=${STAGE}\n`);
	w(
		'src/routes/+layout.ts',
		`import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;
export const load = bridgeBootstrap({ rules: [{ match: '/', public: true }, { match: '/auth/*', public: true }] });
`
	);
	w(
		'src/routes/+layout.svelte',
		`<script lang="ts">
	import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
	let { children } = $props();
</script>

<BridgeBootstrap>{@render children()}</BridgeBootstrap>
`
	);

	// Pages: a public home, a protected dashboard, and the empty callback route SvelteKit needs.
	w(
		'src/routes/+page.svelte',
		`<script lang="ts">
	import { isAuthenticated } from '@nebulr-group/bridge-svelte';
</script>

<h1>My app</h1>
<p>Bridge is ready. Signed in: {$isAuthenticated ? 'yes' : 'no'}.</p>
<p><a href="/dashboard">Open the dashboard</a> (members only)</p>
`
	);
	w('src/routes/dashboard/+page.svelte', '<h1>Dashboard</h1>\n<p>Only signed-in members see this.</p>\n');
	w('src/routes/auth/oauth-callback/+page.svelte', '');
}

async function waitForUrl(url: string, timeoutMs: number) {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`${url} did not come up within ${timeoutMs} ms`);
}

/** Headless Chromium has no address bar: pin the page's address to the top so the frame shows where the visitor is. */
async function showAddress(page: import('@playwright/test').Page) {
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

test('Bridge starts in a SvelteKit app from one line', async ({ demo }) => {
	const { step, terminal, click, show, page } = demo;
	const appId = await stageApp();
	const dir = mkdtempSync(join(tmpdir(), 'my-app-'));
	writeProject(dir, appId);
	const at = { cwd: dir, promptDir: 'my-app', title: 'my-app — a fresh SvelteKit app', timeoutMs: 300_000 };

	try {
		await step('The whole setup is two lines in .env: which app, and which Bridge environment (stage here)', async () => {
			const { output } = await terminal('cat .env', { ...at, clear: true });
			expect(output).toContain('VITE_BRIDGE_APP_ID=');
			expect(output).toContain(`VITE_BRIDGE_API_BASE_URL=${STAGE}`);
		});

		await step('Starting Bridge is one line in the root layout, with the rules for which pages are public', async () => {
			const { output } = await terminal('cat src/routes/+layout.ts', at);
			expect(output).toContain('export const load = bridgeBootstrap({ rules:');
		});

		await step('The layout just wraps the app, so pages render once Bridge is ready, with no loading code of our own', async () => {
			const { output } = await terminal('cat src/routes/+layout.svelte', { ...at, clear: true });
			expect(output).toContain('<BridgeBootstrap>{@render children()}</BridgeBootstrap>');
		});

		await step('Install the published package and start the app', async () => {
			await terminal(
				`set -o pipefail; docker run --rm -v "${dir}":/w -w /w -e NPM_CONFIG_UPDATE_NOTIFIER=false -e NPM_CONFIG_LOGLEVEL=error -e NPM_CONFIG_FUND=false -e NPM_CONFIG_AUDIT=false node:22 npm install 2>&1 | tail -2`,
				{ ...at, shown: `npm install @nebulr-group/bridge-svelte@${SVELTE_VERSION}` }
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

		await step('The public home page shows as soon as Bridge is ready, and knows nobody is signed in yet', async () => {
			await page.goto(LOCAL);
			await expect(page.getByText('Bridge is ready. Signed in: no.')).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
			await show(page.getByRole('heading', { name: 'My app' }));
		});

		await step("Opening a members-only page sends the visitor to stage's hosted sign-in page, found from the API address alone", async () => {
			await click(page.getByRole('link', { name: 'Open the dashboard' }));
			await page.waitForURL(/^https:\/\/auth-stage\.thebridge\.dev\//, { timeout: 30_000 });
			await page.waitForLoadState('networkidle').catch(() => {});
			expect(new URL(page.url()).host).toBe('auth-stage.thebridge.dev');
			await expect(page.getByText('Dashboard')).toHaveCount(0);
			await showAddress(page);
			await show(page.locator('input').first());
		});
	} finally {
		execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`);
		// node_modules was written by the container as root on some hosts; remove it from a container too.
		execSync(`docker run --rm -v "${dir}":/w node:22 rm -rf /w/node_modules /w/.svelte-kit >/dev/null 2>&1 || true`);
		rmSync(dir, { recursive: true, force: true });
	}
});
