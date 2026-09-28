import { test, expect } from '../demo-kit';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * TBP-698 (milestone TBP-M35): make Bridge's sign-in and subscription pages
 * look like your product, one rung at a time.
 *
 * A fresh SvelteKit app on the published @nebulr-group/bridge-svelte beta
 * shows the default sign-in page (rung 0). Three `--bridge-*` tokens in the
 * app's own app.css restyle every Bridge page, the sign-in page and the
 * subscription page alike (rung 1). The `frame` and `heading` snippets put
 * the sign-in pages inside the app's own card with its own heading (rung 2).
 * Creating `src/routes/auth/login/+page.svelte` takes over just that page
 * while signing in still works (rung 3). Headless (rung 4) is not shown.
 *
 * Runs against stage. Setup is part of the file: the stage demo app is
 * deleted and recreated through the stage test endpoints (keyed by
 * PLAYWRIGHT_TEST_API_KEY from bridge-api/config/.env.stage, never printed),
 * with Stripe test keys (STRIPE_TEST_PK / STRIPE_TEST_SK from bridge-svelte's
 * config/.env.test.local; never printed) and one "Pro" plan, so its
 * plan-less workspace owner lands on the subscription page. Files are written
 * from inside the dev-server container so Vite sees every change. The
 * container, the scratch project and the stage app are removed at the end.
 *
 * Re-run (memory preflight first — this starts two containers, one after the other):
 *   ~/Workflows/bin/run-demo.sh TBP-698 bridge-plugins/bridge-svelte/demos/make-sign-in-look-like-your-product.demo.ts --base-url http://localhost:5294
 */

const STAGE = 'https://api-stage.thebridge.dev';
const API_DIR = process.env.DEMO_BRIDGE_API_DIR ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-api';
const SVELTE_ENV = process.env.DEMO_SVELTE_TEST_ENV ?? '/Users/imanpouya/code/nebulr/thebridge-platform/bridge-plugins/bridge-svelte/config/.env.test.local';
const SVELTE_VERSION = process.env.DEMO_SVELTE_VERSION ?? '0.9.0-beta.6';
const DOMAIN = 'demo-sign-in-look';
const PORT = 5294;
const LOCAL = `http://localhost:${PORT}`;
const CONTAINER = 'demo-bridge-sign-in-look';
const TEAL = 'rgb(15, 118, 110)';

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

const removeApp = () =>
	fetch(`${STAGE}/account/test/playwright/test-app`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ domain: DOMAIN }) }).catch(() => {});

const TOKENS = `/* The app's own stylesheet. */
body { font-family: system-ui, sans-serif; }

:root {
  --bridge-primary: #0f766e;
  --bridge-primary-hover: #115e59;
  --bridge-border-radius: 14px;
}
`;

const FRAMED = `<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes>
  {#snippet frame(page, children)}
    <section class="card">
      <p class="brand">Helpdesk</p>
      {@render children()}
    </section>
  {/snippet}
  {#snippet heading(page)}
    <h1>{page === 'signup' ? 'Create your Helpdesk account' : 'Welcome back to Helpdesk'}</h1>
  {/snippet}
</BridgeAuthRoutes>

<style>
  .card { max-width: 400px; margin: 2rem auto; padding: 2rem; border-radius: 16px; background: #f0fdfa; border: 1px solid #99f6e4; }
  .brand { margin: 0; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #0f766e; }
</style>
`;

const OWN_LOGIN = `<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { LoginForm, readReturnTo } from '@nebulr-group/bridge-svelte';
</script>

<main class="own">
  <h1>Helpdesk</h1>
  <p>Our own sign-in page. Bridge still does the signing in.</p>
  <LoginForm onLogin={() => goto(readReturnTo(page.url) ?? '/')} />
</main>

<style>
  .own { max-width: 420px; margin: 2rem auto; }
  .own p { color: #475569; }
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
				name: 'helpdesk',
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
		'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n\t\t%sveltekit.head%\n\t</head>\n\t<body style="margin: 64px 48px 48px">\n\t\t<div style="display: contents">%sveltekit.body%</div>\n\t</body>\n</html>\n'
	);
	w('src/app.css', "/* The app's own stylesheet. */\nbody { font-family: system-ui, sans-serif; }\n");
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
	import '../app.css';
	let { children } = $props();
</script>

<BridgeBootstrap>{@render children()}</BridgeBootstrap>
`
	);
	w('src/routes/+page.svelte', '<h1>Helpdesk</h1>\n<p>Your tickets.</p>\n');
	w('src/routes/auth/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeAuthRoutes />\n");
	w('src/routes/subscription/[...bridge]/+page.svelte', "<script lang=\"ts\">\n\timport { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';\n</script>\n\n<BridgeBillingRoutes />\n");
}

/** Write a project file from inside the dev-server container, so Vite's watcher sees it. */
function writeInContainer(path: string, text: string) {
	execSync(`docker exec -i ${CONTAINER} sh -c 'mkdir -p "$(dirname "/w/${path}")" && cat > "/w/${path}"'`, { input: text });
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

const buttonColour = (page: Page) =>
	page.getByRole('button', { name: 'Sign in', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);

test('Make the sign-in and subscription pages look like your product', async ({ demo }) => {
	test.setTimeout(12 * 60 * 1000);
	const { step, terminal, click, show, page } = demo;
	const stripe = { pk: envValue(SVELTE_ENV, 'STRIPE_TEST_PK'), sk: envValue(SVELTE_ENV, 'STRIPE_TEST_SK') };
	const email = `${DOMAIN}@example.com`;
	const password = `Demo-${Date.now()}-Aa1!`;

	await removeApp();
	const app = await post<{ appId: string; tenantId: string }>('setup-test-app', { domain: DOMAIN, appName: 'Helpdesk', ownerEmail: email, ownerPassword: password, appUrl: LOCAL });
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
	await post('clear-tenant-plan', { appDomain: DOMAIN, tenantId: app.tenantId });
	for (const key of ['TEAM', 'premium', 'free']) await post('delete-plan', { appDomain: DOMAIN, key }).catch(() => undefined);
	await post('ensure-plan', {
		appDomain: DOMAIN,
		key: 'pro',
		name: 'Pro',
		description: 'Unlimited tickets',
		trial: false,
		trialDays: 0,
		prices: [{ amount: 29, currency: 'USD', recurrenceInterval: 'month' }]
	});

	const dir = mkdtempSync(join(tmpdir(), 'helpdesk-'));
	writeProject(dir, app.appId);
	const at = { cwd: dir, promptDir: 'helpdesk', title: 'helpdesk — a fresh SvelteKit app', timeoutMs: 300_000, redact: [stripe.pk, stripe.sk, password] };
	const openLogin = async () => {
		await page.goto(`${LOCAL}/auth/login`);
		await expect(page.locator('#login-email')).toBeVisible({ timeout: 60_000 });
		await showAddress(page);
	};

	try {
		await step(`A fresh SvelteKit app on bridge-svelte ${SVELTE_VERSION}: one file serves every sign-in page, one every subscription page`, async () => {
			await terminal(`find src -type f | sort && cat 'src/routes/auth/[...bridge]/+page.svelte'`, { ...at, clear: true });
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

		await step('Out of the box, the sign-in page is Bridge’s default look, inside the app', async () => {
			await openLogin();
			expect(await buttonColour(page)).toBe('rgb(79, 70, 229)');
			await demo.type(page.locator('#login-email'), email);
			await page.locator('#login-password').fill('••••••••••');
			await show(page.getByRole('button', { name: 'Sign in', exact: true }));
		});

		await step('Three lines in the app’s own stylesheet: a brand colour, its hover shade and rounder corners', async () => {
			await page.goto('about:blank'); // Vite reloads the open page when a file changes
			writeInContainer('src/app.css', TOKENS);
			const { output } = await terminal('cat src/app.css', { ...at, clear: true, title: 'helpdesk — src/app.css' });
			expect(output).toContain('--bridge-primary: #0f766e;');
			await page.waitForTimeout(2000);
		});

		await step('The sign-in page follows at once: the button, the focus ring and the corners are the app’s own', async () => {
			await openLogin();
			await expect.poll(() => buttonColour(page), { timeout: 30_000 }).toBe(TEAL);
			await demo.type(page.locator('#login-email'), email);
			await page.locator('#login-password').fill('••••••••••');
			await show(page.getByRole('button', { name: 'Sign in', exact: true }));
		});

		await step('One step further: the frame and heading snippets put every sign-in page inside the app’s own card and words', async () => {
			await page.goto('about:blank'); // Vite reloads the open page when a file changes
			writeInContainer('src/routes/auth/[...bridge]/+page.svelte', FRAMED);
			const { output } = await terminal(`cat 'src/routes/auth/[...bridge]/+page.svelte' | head -16`, {
				...at,
				clear: true,
				title: 'helpdesk — src/routes/auth/[...bridge]/+page.svelte'
			});
			expect(output).toContain('{#snippet frame(page, children)}');
			await page.waitForTimeout(2000);
		});

		await step('Sign-in and sign-up now read “Welcome back to Helpdesk” and “Create your Helpdesk account”, in the app’s card', async () => {
			await page.goto(`${LOCAL}/auth/signup`);
			await expect(page.getByRole('heading', { name: 'Create your Helpdesk account' })).toBeVisible({ timeout: 30_000 });
			await openLogin();
			await expect(page.getByRole('heading', { name: 'Welcome back to Helpdesk' })).toBeVisible({ timeout: 30_000 });
			await show(page.getByRole('heading', { name: 'Welcome back to Helpdesk' }));
		});

		await step('To own one page completely, create its file: the app now has its own login page, and every other page stays Bridge’s', async () => {
			await page.goto('about:blank'); // Vite reloads the open page when a file changes
			writeInContainer('src/routes/auth/login/+page.svelte', OWN_LOGIN);
			const { output } = await terminal(`find src/routes -name '*.svelte' | sort && cat src/routes/auth/login/+page.svelte | head -12`, {
				...at,
				clear: true
			});
			expect(output).toContain('src/routes/auth/login/+page.svelte');
			await page.waitForTimeout(3000);
		});

		await step('/auth/login is the app’s own page now, and signing in on it still works', async () => {
			await page.goto(`${LOCAL}/auth/login`);
			await expect(page.getByText('Our own sign-in page. Bridge still does the signing in.')).toBeVisible({ timeout: 60_000 });
			await expect(page.getByRole('heading', { name: 'Welcome back to Helpdesk' })).toHaveCount(0);
			await showAddress(page);
			await demo.type(page.locator('#login-email'), email);
			await page.locator('#login-password').fill(password);
			await show(page.getByText('Our own sign-in page. Bridge still does the signing in.'));
		});

		await step('Signed in, the owner lands on Bridge’s plan page, in the same brand colour and corners', async () => {
			await click(page.getByRole('button', { name: 'Sign in', exact: true }));
			await page.waitForURL((u) => u.pathname === '/subscription/plan', { timeout: 60_000 });
			const card = page.locator('[data-bridge-plan-card]').filter({ hasText: 'Pro' });
			await expect(card).toBeVisible({ timeout: 30_000 });
			const colour = await card.locator('button').first().evaluate((el) => getComputedStyle(el).backgroundColor);
			expect(colour).toBe(TEAL);
			await showAddress(page);
			await show(card.locator('button').first());
		});
	} finally {
		execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`);
		execSync(`docker run --rm -v "${dir}":/w node:22 rm -rf /w/node_modules /w/.svelte-kit >/dev/null 2>&1 || true`);
		rmSync(dir, { recursive: true, force: true });
		await removeApp();
	}
});
