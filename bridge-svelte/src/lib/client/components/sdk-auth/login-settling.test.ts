/**
 * TBP-635 — LoginForm must never draw the credentials form to somebody who has
 * already authenticated.
 *
 * The top-level branch named `mfa-required`, `mfa-setup-required` and
 * `tenant-selection`, and let everything else fall through to the password
 * form. `authenticated` and `credentials-validated` are also "everything else",
 * so between the token exchange resolving and the host app's router landing —
 * LoginForm fires `onLogin` and deliberately does not navigate — the component
 * showed a password field to a user who had just typed their password
 * correctly. That reads as a refusal. Measured at 600ms against a local stack.
 *
 * ## What this file can and cannot prove
 *
 * The ticket's suggested test is a MutationObserver recording every DOM batch
 * during a real login, because a sampling loop can miss the race. This
 * workspace has no DOM (see auth-form-description.test.ts for why), so that
 * exact test is not available here and belongs in the Playwright e2e suite.
 *
 * What IS available is stronger in the dimension that actually caused the bug.
 * The defect was not a timing subtlety — it was an unhandled branch. So this
 * enumerates EVERY member of `AuthState`, read out of auth-core's shipped
 * type declaration rather than hardcoded, and asserts that exactly one of them
 * renders a password field. A seventh state added to auth-core tomorrow is
 * covered the moment it exists, which is the half a race-detector would miss.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { render } from 'svelte/server';
import { type Component } from 'svelte';
import { en, sv } from '@nebulr-group/bridge-auth-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMPONENT_DIR = 'src/lib/client/components/sdk-auth';
const SEED_PREFIX = '__seeded-settling-';

/**
 * Every `AuthState`, parsed out of the auth-core declaration the package
 * actually ships.
 *
 * Deliberately not a literal list: a hardcoded one would still say six when
 * auth-core says seven, and the bug being fixed is precisely a state nobody
 * remembered to handle. Parsing throws rather than returning a short list, so a
 * refactor that moves the type fails this suite loudly instead of quietly
 * testing fewer states.
 */
function authStates(): string[] {
  // Resolved from the filesystem rather than the module system: the package
  // exports no `./package.json` subpath, and vitest's module runner supports
  // neither `require.resolve` nor `import.meta.resolve` here. Both candidate
  // paths are tried because bun may hoist the dep to the workspace root.
  const candidates = [
    path.join(ROOT, 'node_modules/@nebulr-group/bridge-auth-core/dist/types.d.ts'),
    path.join(ROOT, '../node_modules/@nebulr-group/bridge-auth-core/dist/types.d.ts'),
  ];
  const dts = candidates.find((c) => fs.existsSync(c));
  if (!dts) {
    throw new Error(
      `auth-core types.d.ts not found. Looked in:\n  ${candidates.join('\n  ')}`,
    );
  }
  const source = fs.readFileSync(dts, 'utf8');
  const match = source.match(/export type AuthState\s*=([^;]+);/);
  if (!match) {
    throw new Error('Could not find `export type AuthState` in auth-core types.d.ts.');
  }
  const states = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (states.length < 2) {
    throw new Error(`Parsed only ${states.length} AuthState members — parser is wrong.`);
  }
  return states;
}

const STATES = authStates();

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
}, 120_000);

afterAll(async () => {
  await server?.close();
  for (const p of seededPaths) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

/**
 * Render LoginForm with `currentAuthState` pinned.
 *
 * The seed replaces the one `$derived($authState)` line, so the template — every
 * branch, the wrapper call, the catalogue lookups — is the real shipped source.
 * Driving the store itself would need the network and the real state machine,
 * and would test auth-core's transitions rather than this component's branching,
 * which is where the defect was.
 */
async function renderAtState(state: string, props: Record<string, unknown> = {}): Promise<string> {
  const file = 'LoginForm.svelte';
  const from = 'let currentAuthState = $derived($authState);';
  let source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, file), 'utf8');
  if (!source.includes(from)) {
    throw new Error(
      `State seed target not found in ${file}:\n  ${from}\n` +
        'The component was refactored. Update the seed so the test keeps driving ' +
        'the auth-state branch — do not delete the assertion.',
    );
  }
  source = source.replace(from, `let currentAuthState = $state('${state}');`);

  const name = `${SEED_PREFIX}${process.pid}-${seededPaths.length}-${file}`;
  const full = path.join(ROOT, COMPONENT_DIR, name);
  fs.writeFileSync(full, source);
  seededPaths.push(full);

  const mod = await server.ssrLoadModule(`/${COMPONENT_DIR}/${name}`);
  const Component = mod.default as Component<Record<string, unknown>>;
  return render(Component, { props }).body;
}

async function setLocale(locale: string | undefined): Promise<void> {
  const mod = await server.ssrLoadModule('/src/lib/client/stores/config.store.ts');
  mod.bridgeConfig.initConfig({ appId: 'tbp-635-test', locale });
}

/** A password field is the thing that must never appear post-auth. */
function hasPasswordField(html: string): boolean {
  return /<input[^>]+type="password"/.test(html);
}

function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// 1. The fixture itself
// ---------------------------------------------------------------------------

describe('AuthState coverage (TBP-635)', () => {
  it('reads the real state list out of the shipped auth-core types', () => {
    // If this drifts, every assertion below silently covers less.
    expect(STATES).toContain('unauthenticated');
    expect(STATES).toContain('authenticated');
    expect(STATES).toContain('credentials-validated');
    expect(STATES.length).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// 2. The invariant
// ---------------------------------------------------------------------------

describe('LoginForm never shows the credentials form post-auth (TBP-635)', () => {
  it('renders a password field for `unauthenticated` and for nothing else', async () => {
    await setLocale(undefined);
    const withPassword: string[] = [];
    for (const state of STATES) {
      if (hasPasswordField(await renderAtState(state))) withPassword.push(state);
    }
    // Both directions. Asserting only "authenticated has no password field"
    // would pass for a component that rendered nothing at all, ever.
    expect(withPassword).toEqual(['unauthenticated']);
  });

  for (const state of ['authenticated', 'credentials-validated']) {
    it(`shows the settling card at "${state}"`, async () => {
      await setLocale(undefined);
      const html = await renderAtState(state);
      expect(html).toContain('data-bridge-auth-settling');
      expect(hasPasswordField(html)).toBe(false);
      // Not a blank card: an empty box during a pause is its own bad message.
      expect(text(html)).toContain(en['login.submitting']);
    });
  }

  it('translates the waiting copy', async () => {
    await setLocale('sv');
    const html = await renderAtState('authenticated');
    expect(text(html)).toContain(sv['login.submitting']);
    expect(text(html)).not.toContain(en['login.submitting']);
  });

  it('suppresses the heading while settling, so no stale "Log in" survives', async () => {
    await setLocale(undefined);
    const html = await renderAtState('authenticated', { heading: 'Log in to NorthWhistle' });
    expect(html).not.toContain('Log in to NorthWhistle');
    expect(html).toContain('data-bridge-auth-settling');
  });

  it('still hands the three delegated states to their own components', async () => {
    // The fix must not have swallowed the branches that already worked — an
    // over-eager `!== unauthenticated` placed above them would do exactly that.
    await setLocale(undefined);
    expect(await renderAtState('tenant-selection')).toContain('bridge-tenant-list');
    expect(await renderAtState('mfa-required')).toContain(en['mfa.challengeHeading']);
    expect(await renderAtState('mfa-setup-required')).toContain(en['mfaSetup.heading']);
  });

  it('leaves the unauthenticated step machine alone', async () => {
    await setLocale(undefined);
    const html = await renderAtState('unauthenticated');
    expect(hasPasswordField(html)).toBe(true);
    expect(html).toContain(en['login.submit']);
    expect(html).not.toContain('data-bridge-auth-settling');
  });
});

// ---------------------------------------------------------------------------
// 3. onLogin is untouched
// ---------------------------------------------------------------------------

describe('onLogin lifecycle is unchanged (TBP-635)', () => {
  it('still fires from an effect keyed on `authenticated`', () => {
    // Effects do not run in a server render, so this is asserted on the source.
    // It is here because the tempting wrong fix for this bug is to move
    // `onLogin` earlier so the consumer navigates sooner — which would fire it
    // before the session is real.
    const source = fs.readFileSync(
      path.join(ROOT, COMPONENT_DIR, 'LoginForm.svelte'),
      'utf8',
    );
    const effect = source.match(/\$effect\(\(\) => \{[\s\S]*?\}\);/);
    expect(effect, 'LoginForm no longer has an $effect').not.toBeNull();
    expect(effect![0]).toContain("currentAuthState === 'authenticated'");
    expect(effect![0]).toContain('onLogin?.()');
    // Exactly one call site, so it cannot fire twice.
    expect(source.match(/onLogin\?\.\(\)/g)).toHaveLength(1);
  });
});
