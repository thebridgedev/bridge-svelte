import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-696 (milestone TBP-M35): one file serves every sign-in page, and a
 * missing route can no longer break signup.
 *
 * A fresh SvelteKit app using the published @nebulr-group/bridge-svelte beta
 * has ONE auth file, `src/routes/auth/[...bridge]/+page.svelte` =
 * `<BridgeAuthRoutes />`, in SDK (in-app) login mode. The browser opens login,
 * signup and forgot-password from it, signs a real user up on stage and follows
 * the verification email's address to a set-password page nobody wrote. Then
 * the app takes over login by creating `auth/login/+page.svelte`, and signup
 * still works; finally the `frame` / `heading` snippets restyle every page.
 *
 * Setup is part of the file: the stage demo app is deleted and recreated
 * through the stage test endpoints (keyed by PLAYWRIGHT_TEST_API_KEY from
 * bridge-api/config/.env.stage, never printed) with the local URL registered
 * as an allowed origin. The verification address is read with the stage test
 * endpoint `signup-verification-link` (the same address bridge-api puts in the
 * email). The container, the scratch project and the stage app are removed at
 * the end.
 *
 * Re-run (memory preflight first — this starts two containers, one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-696 bridge-plugins/bridge-svelte/demos/one-file-serves-every-sign-in-page.demo.ts --base-url http://localhost:5291
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.6';
const DOMAIN = 'demo-one-auth-file';
const PORT = 5291;
const LOCAL = `http://localhost:${PORT}`;
const CONTAINER = 'demo-bridge-one-auth-file';

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
	return (await res.json()) as T;
}

async function stageApp(): Promise<string> {
	await fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ domain: DOMAIN }) });
	const app = await json<{ appId: string }>('/account/test/playwright/setup-test-app', {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ domain: DOMAIN, appName: 'One auth file demo', ownerEmail: 'demo-one-auth-file@example.com', appUrl: LOCAL })
	});
	await json('/account/test/playwright/configure-app', {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({
			appDomain: DOMAIN,
			allowedOrigins: [LOCAL],
			redirectUris: [`${LOCAL}/auth/oauth-callback`],
			defaultCallbackUri: `${LOCAL}/auth/oauth-callback`
		})
	});
	return app.appId;
}

/** The address bridge-api put in the verification email for this signup. */
async function verificationLink(email: string): Promise<string> {
	const q = new URLSearchParams({ email, appDomain: DOMAIN, originUrl: LOCAL });
	const { link } = await json<{ link: string }>(`/account/test/playwright/signup-verification-link?${q}`, { headers: headers() });
	return link;
}

const CATCH_ALL = 'src/routes/auth/[...bridge]/+page.svelte';
const ONE_FILE = `<script lang="ts">
	import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
`;

const OWN_LOGIN = `<script lang="ts">
	import { goto } from '$app/navigation';
	import { LoginForm } from '@nebulr-group/bridge-svelte';
</script>

<main class="acme">
	<h1>Acme members</h1>
	<p>Our own sign-in page. Every other auth page still comes from Bridge.</p>
	<LoginForm showSignupLink signupHref="/auth/signup" onLogin={() => goto('/')} />
</main>

<style>
	.acme { max-width: 420px; margin: 2rem auto; padding: 1.5rem; border-radius: 14px; background: #fff7ed; border: 2px solid #fb923c; }
	h1 { margin: 0; color: #9a3412; }
</style>
`;

const FRAMED = `<script lang="ts">
	import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes>
	{#snippet frame(page, children)}
		<section class="card">
			<p class="brand">ACME</p>
			{@render children()}
		</section>
	{/snippet}
	{#snippet heading(page)}
		<h1>{page === 'signup' ? 'Start your free Acme account' : 'Acme'}</h1>
	{/snippet}
</BridgeAuthRoutes>

<style>
	.card { max-width: 420px; margin: 2rem auto; padding: 2rem; border-radius: 16px; background: #eef2ff; border: 2px solid #6366f1; }
	.brand { margin: 0 0 .5rem; font: 700 12px monospace; letter-spacing: .2em; color: #4f46e5; }
</style>
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
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t\t%sveltekit.head%\n\t</head>\n\t<body style="font-family: system-ui, sans-serif; margin: 64px 48px 48px">\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>\n'
	);
	w('.env', `VITE_BRIDGE_APP_ID=${appId}\nVITE_BRIDGE_API_BASE_URL=${STAGE}\n`);
	w(
		'src/routes/+layout.ts',
		`import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;
export const load = bridgeBootstrap({
	loginRoute: '/auth/login',
	rules: [{ match: '/', public: true }, { match: new RegExp('^/auth($|/)'), public: true }],
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
	w('src/routes/+page.svelte', '<h1>My app</h1>\n<p><a href="/auth/login">Sign in</a></p>\n');
	w(CATCH_ALL, ONE_FILE);
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
		const path = location.pathname.replace(/(\/set-password\/)[^/]{10,}/, '$1…');
		bar.textContent = location.origin + path;
		bar.setAttribute(
			'style',
			'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;padding:6px 16px;border-radius:999px;' +
				'background:#f1f3f5;border:1px solid #d0d5db;color:#1d1f24;font:500 14px/1.3 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)'
		);
		document.documentElement.appendChild(bar);
	});
}

/**
 * Write a file the way the developer's editor would, as seen by the dev server:
 * from inside its container. A file written on the macOS host reaches the
 * container's bind mount without a file-system event, so SvelteKit would never
 * notice a new route.
 */
function writeInApp(path: string, text: string) {
	execSync(`docker exec -i ${CONTAINER} sh -c 'mkdir -p "$(dirname "$1")" && cat > "$1"' _ '/w/${path}'`, { input: text });
}

/** After a file is added or changed on the host, reload until the dev server serves the new version. */
async function openWhenServed(page: Page, path: string, ready: string) {
	const until = Date.now() + 60_000;
	while (Date.now() < until) {
		await page.goto(`${LOCAL}${path}`);
		try {
			await expect(page.locator(ready).first()).toBeVisible({ timeout: 5_000 });
			await showAddress(page);
			return;
		} catch {
			/* not picked up yet */
		}
	}
	console.log(execSync(`docker logs --tail 40 ${CONTAINER} 2>&1`).toString());
	throw new Error(`${path} never showed ${ready}`);
}

/** Open a page of the app and wait for the catch-all (or the app's own page) to render it. */
async function open(page: Page, path: string, ready: string) {
	await page.goto(`${LOCAL}${path}`);
	await expect(page.locator(ready).first()).toBeVisible({ timeout: 30_000 });
	await showAddress(page);
}

async function signUp(demo: { page: Page; type: (t: import('@playwright/test').Locator, s: string) => Promise<void>; click: (t: import('@playwright/test').Locator) => Promise<void> }, email: string) {
	const { page } = demo;
	await demo.type(page.locator('#signup-email'), email);
	await demo.type(page.locator('#signup-first-name'), 'Ada');
	await demo.type(page.locator('#signup-last-name'), 'Lovelace');
	await demo.click(page.getByRole('button', { name: 'Sign up' }));
	await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({ timeout: 30_000 });
}

test('One file serves every sign-in page, and signup can no longer break', async ({ demo }) => {
	const { step, terminal, click, show, page } = demo;
	const appId = await stageApp();
	const dir = mkdtempSync(join(tmpdir(), 'my-app-'));
	writeProject(dir, appId);
	const at = { cwd: dir, promptDir: 'my-app', title: 'my-app — a fresh SvelteKit app', timeoutMs: 300_000 };
	const run = Date.now();
	const first = `iman+playwright-test-authfile-${run}@nebulr.group`;
	const second = `iman+playwright-test-authfile-${run}-b@nebulr.group`;

	try {
		await step('In-app sign-in is one setting in the root layout: where the login page lives', async () => {
			const { output } = await terminal('cat src/routes/+layout.ts', { ...at, clear: true });
			expect(output).toContain("loginRoute: '/auth/login'");
		});

		await step('And the whole set of sign-in pages is ONE file: a catch-all route holding a single component', async () => {
			const { output } = await terminal(`find src/routes -name '*.svelte' | sort && cat 'src/routes/auth/[...bridge]/+page.svelte'`, {
				...at,
				clear: true
			});
			expect(output).toContain('<BridgeAuthRoutes />');
			expect(output).not.toContain('auth/login/+page.svelte');
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

		await step('/auth/login is served by that one file: the sign-in form, with the methods this app has switched on', async () => {
			await open(page, '/auth/login', '[data-bridge-auth-route="login"] #login-email');
			await show(page.locator('#login-email'));
		});

		await step('/auth/signup comes from the same file', async () => {
			await open(page, '/auth/signup', '[data-bridge-auth-route="signup"] #signup-email');
			await show(page.locator('#signup-email'));
		});

		await step('So does /auth/forgot-password', async () => {
			await open(page, '/auth/forgot-password', '[data-bridge-auth-route="forgot-password"] #reset-email');
			await show(page.locator('#reset-email'));
		});

		await step('A real signup on stage: the visitor is told to check their email', async () => {
			await open(page, '/auth/signup', '#signup-email');
			await signUp(demo, first);
		});

		await step("The verification email's link opens /auth/set-password/… — a page nobody wrote, so no signup lands on a 404", async () => {
			const link = new URL(await verificationLink(first));
			expect(link.pathname).toMatch(/^\/auth\/set-password\/[^/]+$/);
			await open(page, `${link.pathname}${link.search}`, '[data-bridge-auth-route="set-password"] #newPassword');
			await demo.type(page.locator('#newPassword'), 'Demo-password-1');
			await demo.type(page.locator('#confirmPassword'), 'Demo-password-1');
		});

		await step('The new member sets a password and is done', async () => {
			await click(page.locator('form button[type="submit"]'));
			await expect(page.locator('.bridge-success-heading')).toBeVisible({ timeout: 30_000 });
			await showAddress(page);
		});

		await step('To own the login page, the app just creates it: auth/login/+page.svelte, its own design', async () => {
			// Off the app first: the dev server reloads its open pages when a route changes.
			await page.goto('about:blank');
			writeInApp('src/routes/auth/login/+page.svelte', OWN_LOGIN);
			const { output } = await terminal("cat src/routes/auth/login/+page.svelte | sed -n '1,13p'", { ...at, clear: true });
			expect(output).toContain('<LoginForm');
		});

		await step('/auth/login is now the app’s own page', async () => {
			await openWhenServed(page, '/auth/login', 'h1:has-text("Acme members")');
			await expect(page.locator('[data-bridge-auth-route]')).toHaveCount(0);
			await show(page.getByRole('heading', { name: 'Acme members' }));
		});

		await step('Signup still comes from the one file and still works: another real signup goes through', async () => {
			await open(page, '/auth/signup', '[data-bridge-auth-route="signup"] #signup-email');
			await signUp(demo, second);
		});

		await step('…and its verification link still lands on the set-password page', async () => {
			const link = new URL(await verificationLink(second));
			await open(page, `${link.pathname}${link.search}`, '[data-bridge-auth-route="set-password"] #newPassword');
			await show(page.locator('#newPassword'));
		});

		await step('Restyling every page takes two snippets in the same file: a frame around the form, and the heading', async () => {
			// Off the app first: the dev server reloads its open pages when a route changes.
			await page.goto('about:blank');
			writeInApp(CATCH_ALL, FRAMED);
			const { output } = await terminal(`cat 'src/routes/auth/[...bridge]/+page.svelte' | sed -n '1,14p'`, { ...at, clear: true });
			expect(output).toContain('{#snippet frame(page, children)}');
		});

		await step('Signup before (step 5) and now: the frame and heading apply, and no page had to be owned', async () => {
			await openWhenServed(page, '/auth/signup', '[data-bridge-auth-route="signup"] .card #signup-email');
			await expect(page.getByRole('heading', { name: 'Start your free Acme account' })).toBeVisible();
			await show(page.getByRole('heading', { name: 'Start your free Acme account' }));
		});

		await step('The frame wraps forgot-password too, from the same two snippets', async () => {
			await open(page, '/auth/forgot-password', '[data-bridge-auth-route="forgot-password"] .card #reset-email');
			await show(page.locator('#reset-email'));
		});
	} finally {
		execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`);
		execSync(`docker run --rm -v "${dir}":/w node:22 rm -rf /w/node_modules /w/.svelte-kit >/dev/null 2>&1 || true`);
		rmSync(dir, { recursive: true, force: true });
		await fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ domain: DOMAIN }) }).catch(() => {});
	}
});
