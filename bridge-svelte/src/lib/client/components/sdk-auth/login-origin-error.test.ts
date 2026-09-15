/**
 * TBP-669 — LoginForm must show a sign-in failure instead of "Signing in…".
 *
 * On stage, a magic-link sign-in from an origin missing from the app's allowed
 * origins was accepted, then the token exchange answered 403 "Origin not
 * allowed". The auth state stayed at `credentials-validated` (auth-core before
 * TBP-669 did not reset it), and LoginForm renders every non-`unauthenticated`
 * state as the settling spinner — so the error it had caught never rendered.
 *
 * Same technique as login-settling.test.ts: the component source is rendered
 * with `svelte/server`, with the auth state and the caught error seeded in
 * place of the lines that would set them at runtime.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { render } from 'svelte/server';
import { type Component } from 'svelte';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMPONENT_DIR = 'src/lib/client/components/sdk-auth';
const SEED_PREFIX = '__seeded-origin-';
const MSG =
	"This app's allowed origins in Bridge don't include http://localhost:5181 — add it in Bridge admin under Authentication → Security → Allowed Origins.";

let server: ViteDevServer;
const seededPaths: string[] = [];

beforeAll(async () => {
	for (const f of fs.readdirSync(path.join(ROOT, COMPONENT_DIR))) {
		if (f.startsWith(SEED_PREFIX)) fs.unlinkSync(path.join(ROOT, COMPONENT_DIR, f));
	}
	server = await createServer({
		configFile: false,
		root: ROOT,
		logLevel: 'error',
		server: { middlewareMode: true, hmr: false },
		plugins: [svelte({ compilerOptions: { dev: false } })],
	});
	// The credentials form reads BridgeConfig (signupRoute); bootstrap it once.
	const config = await server.ssrLoadModule('/src/lib/client/stores/config.store.ts');
	config.bridgeConfig.initConfig({ appId: 'tbp-669-test' });
}, 120_000);

afterAll(async () => {
	await server?.close();
	for (const p of seededPaths) if (fs.existsSync(p)) fs.unlinkSync(p);
});

/** Render LoginForm with the auth state, the caught error and the state it was caught in pinned. */
async function renderSeeded(seed: { state: string; error: string | null; errorAtState: string | null }): Promise<string> {
	const file = 'LoginForm.svelte';
	let source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, file), 'utf8');
	const seeds: Array<[string, string]> = [
		['let currentAuthState = $derived($authState);', `let currentAuthState = $state(${JSON.stringify(seed.state)});`],
		['let error = $state<string | null>(null);', `let error = $state<string | null>(${JSON.stringify(seed.error)});`],
		[
			'let errorAtState = $state<string | null>(null);',
			`let errorAtState = $state<string | null>(${JSON.stringify(seed.errorAtState)});`,
		],
	];
	for (const [from, to] of seeds) {
		if (!source.includes(from)) {
			throw new Error(`Seed target not found in ${file}:\n  ${from}\nUpdate the seed — do not delete the assertion.`);
		}
		source = source.replace(from, to);
	}
	const name = `${SEED_PREFIX}${process.pid}-${seededPaths.length}-${file}`;
	const full = path.join(ROOT, COMPONENT_DIR, name);
	fs.writeFileSync(full, source);
	seededPaths.push(full);
	const mod = await server.ssrLoadModule(`/${COMPONENT_DIR}/${name}`);
	return render(mod.default as Component<Record<string, unknown>>, { props: {} }).body;
}

const settling = (html: string) => html.includes('data-bridge-auth-settling');
const passwordField = (html: string) => /<input[^>]+type="password"/.test(html);
const decode = (html: string) => html.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

describe('LoginForm shows a failed token exchange (TBP-669)', () => {
	it('an error raised at credentials-validated renders the form with the error, not "Signing in…"', async () => {
		const html = await renderSeeded({ state: 'credentials-validated', error: MSG, errorAtState: 'credentials-validated' });
		expect(settling(html)).toBe(false);
		expect(decode(html)).toContain(MSG);
		expect(html).toContain('data-bridge-alert');
		// The user can try again from the same screen.
		expect(passwordField(html)).toBe(true);
	});

	it('a stale error from an earlier attempt does not hijack a later sign-in (TBP-635 still holds)', async () => {
		// e.g. a wrong password, then a passkey sign-in that succeeds.
		const html = await renderSeeded({ state: 'credentials-validated', error: 'Invalid email or password.', errorAtState: 'unauthenticated' });
		expect(settling(html)).toBe(true);
		expect(passwordField(html)).toBe(false);
	});

	it('without an error, credentials-validated is still the settling card', async () => {
		const html = await renderSeeded({ state: 'credentials-validated', error: null, errorAtState: null });
		expect(settling(html)).toBe(true);
		expect(passwordField(html)).toBe(false);
	});

	it('after auth-core resets to unauthenticated, the error shows on the credentials form', async () => {
		const html = await renderSeeded({ state: 'unauthenticated', error: MSG, errorAtState: 'unauthenticated' });
		expect(decode(html)).toContain(MSG);
		expect(passwordField(html)).toBe(true);
	});
});
