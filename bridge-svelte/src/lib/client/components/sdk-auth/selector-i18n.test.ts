// TenantSelector, WorkspaceSelector and SsoButton were missed by TBP-630's
// original i18n sweep and by the TBP-633 port, so they still rendered English
// in all four UI packages after everything around them had been translated.
// TenantSelector is the one that stings: it renders MID-LOGIN on the
// multi-workspace path, putting one English screen between a translated login
// form and a translated app (TBP-634).
//
// HARNESS NOTE — see auth-form-description.test.ts for the full explanation of
// why these render through Svelte's server renderer rather than a DOM. Short
// version: this workspace has no DOM implementation, so `mount()` and therefore
// clicks are unavailable. Two consequences shape this file.
//
// 1. Anything reachable at initial render (TenantSelector's heading,
//    SsoButton's label) is asserted on the REAL rendered markup.
//
// 2. The five error strings are only produced inside a catch block a click
//    would have to reach. Those get two assertions that are weak alone and
//    strong together:
//      - a `seeded()` render proving the KEY resolves to real Swedish, and
//      - a source sweep proving the English literal the handler used to carry
//        is gone from the file.
//    Reverting the handler to `'Failed to select workspace.'` puts that exact
//    string back in the source and fails the sweep. The sweep reads its
//    forbidden strings out of auth-core's `en` catalogue, so it cannot drift
//    from what the keys actually say.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { render } from 'svelte/server';
import { type Component } from 'svelte';
import { en, sv, type MessageKey } from '@nebulr-group/bridge-auth-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMPONENT_DIR = 'src/lib/client/components/sdk-auth';
const SEED_PREFIX = '__seeded-i18n-';

/** The keys TBP-634 added, and which component owns each. */
const OWNED: Record<string, MessageKey[]> = {
  'TenantSelector.svelte': ['tenant.chooseHeading', 'tenant.error.select'],
  'WorkspaceSelector.svelte': ['workspace.error.load', 'workspace.error.switch'],
  'SsoButton.svelte': ['sso.continueWith', 'sso.error.popupBlocked', 'sso.error.login'],
};

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

function componentId(file: string): string {
  return `/${COMPONENT_DIR}/${file}`;
}

/** A copy of `file` with initial-state literals replaced, to reach a later view. */
function seeded(file: string, seeds: Array<[from: string, to: string]>): string {
  let source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, file), 'utf8');
  for (const [from, to] of seeds) {
    if (!source.includes(from)) {
      throw new Error(
        `State seed target not found in ${file}:\n  ${from}\n` +
          'The component was refactored. Update the seed so the test keeps ' +
          'rendering the intended view — do not delete the assertion.',
      );
    }
    source = source.replace(from, to);
  }
  const name = `${SEED_PREFIX}${process.pid}-${seededPaths.length}-${file}`;
  const full = path.join(ROOT, COMPONENT_DIR, name);
  fs.writeFileSync(full, source);
  seededPaths.push(full);
  return `/${COMPONENT_DIR}/${name}`;
}

type AnyProps = Record<string, unknown>;

async function renderComponent(id: string, props: AnyProps = {}): Promise<string> {
  const mod = await server.ssrLoadModule(id);
  const Component = mod.default as Component<AnyProps>;
  return render(Component, { props }).body;
}

/**
 * Point the shared config store at a locale.
 *
 * The components read locale off BridgeConfig rather than taking it as a prop,
 * so this is how a real app sets it. Loaded through the same Vite module graph
 * the components resolve, otherwise they would read a different store instance.
 */
async function setLocale(locale: string | undefined): Promise<void> {
  const mod = await server.ssrLoadModule('/src/lib/client/stores/config.store.ts');
  mod.bridgeConfig.initConfig({ appId: 'tbp-634-test', locale });
}

const CONNECTION = { type: 'google', name: 'Google' } as unknown as Record<string, unknown>;

function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// 1. What the server renderer can reach directly
// ---------------------------------------------------------------------------

describe('TenantSelector heading (TBP-634)', () => {
  it('renders the English heading when no locale is set', async () => {
    await setLocale(undefined);
    const html = await renderComponent(componentId('TenantSelector.svelte'));
    expect(text(html)).toContain(en['tenant.chooseHeading']);
  });

  it('renders the Swedish heading at locale sv', async () => {
    await setLocale('sv');
    const html = await renderComponent(componentId('TenantSelector.svelte'));
    const rendered = text(html);
    expect(rendered).toContain(sv['tenant.chooseHeading']);
    // The English must be GONE, not merely joined by the Swedish. A component
    // that rendered both would satisfy a `toContain` on the Swedish alone.
    expect(rendered).not.toContain(en['tenant.chooseHeading']);
  });

  it('lets a per-component override beat the locale', async () => {
    await setLocale('sv');
    const html = await renderComponent(componentId('TenantSelector.svelte'), {
      messages: { 'tenant.chooseHeading': 'Välj kund' },
    });
    const rendered = text(html);
    expect(rendered).toContain('Välj kund');
    expect(rendered).not.toContain(sv['tenant.chooseHeading']);
  });

  it('never renders the raw key', async () => {
    for (const locale of ['sv', 'de', 'klingon', undefined]) {
      await setLocale(locale);
      const html = await renderComponent(componentId('TenantSelector.svelte'));
      expect(text(html)).not.toContain('tenant.chooseHeading');
    }
  });
});

describe('SsoButton label (TBP-634)', () => {
  it('interpolates the provider name into the localised label', async () => {
    await setLocale('sv');
    const html = await renderComponent(componentId('SsoButton.svelte'), {
      connection: CONNECTION,
    });
    const rendered = text(html);
    expect(rendered).toBe(
      sv['sso.continueWith'].replace('{provider}', 'Google'),
    );
    // Placeholder consumed, not printed.
    expect(rendered).not.toContain('{provider}');
    expect(rendered).not.toContain(en['sso.continueWith'].replace('{provider}', 'Google'));
  });

  it('still lets the app supply its own label — that is voice, not mechanics', async () => {
    await setLocale('sv');
    const html = await renderComponent(componentId('SsoButton.svelte'), {
      connection: CONNECTION,
      label: 'Logga in med jobbkontot',
    });
    expect(text(html)).toBe('Logga in med jobbkontot');
  });

  it('falls back to English for an unsupported locale, never to the key', async () => {
    // Invented, not a real-but-unshipped code: TBP-632 turned 'de' and 'fr'
    // into shipped locales and broke every test that had borrowed one as its
    // stand-in for 'unknown'.
    await setLocale('klingon');
    const html = await renderComponent(componentId('SsoButton.svelte'), {
      connection: CONNECTION,
    });
    expect(text(html)).toBe(en['sso.continueWith'].replace('{provider}', 'Google'));
  });
});

// ---------------------------------------------------------------------------
// 2. The error strings, reached by seeding initial state
// ---------------------------------------------------------------------------

describe('selector error copy resolves through the catalogue (TBP-634)', () => {
  const CASES: Array<{ file: string; from: string; key: MessageKey }> = [
    {
      file: 'TenantSelector.svelte',
      from: 'let error = $state<string | null>(null);',
      key: 'tenant.error.select',
    },
    {
      file: 'WorkspaceSelector.svelte',
      from: 'let loadError = $state<string | null>(null);',
      key: 'workspace.error.load',
    },
    {
      file: 'WorkspaceSelector.svelte',
      from: 'let switchError = $state<string | null>(null);',
      key: 'workspace.error.switch',
    },
  ];

  for (const { file, from, key } of CASES) {
    it(`${file} renders ${key} in Swedish`, async () => {
      await setLocale('sv');
      const to = from.replace('(null)', `(t('${key}'))`);
      const html = await renderComponent(seeded(file, [[from, to]]));
      const rendered = text(html);
      expect(rendered).toContain(sv[key]);
      expect(rendered).not.toContain(en[key]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Source sweep — the half that survives a reverted handler
// ---------------------------------------------------------------------------

describe('no English literal remains in the three components (TBP-634)', () => {
  for (const [file, keys] of Object.entries(OWNED)) {
    it(`${file} carries none of its English strings as a literal`, () => {
      const source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, file), 'utf8');
      for (const key of keys) {
        // Interpolated copy is compared on its literal prefix: the source used
        // to hold `Continue with ${connection.name}`, which is the catalogue
        // string with the placeholder swapped for an expression.
        const needle = en[key].split('{')[0].trim();
        expect(needle.length, `${key} has no comparable literal prefix`).toBeGreaterThan(4);
        expect(source, `${file} still contains "${needle}"`).not.toContain(needle);
      }
    });
  }

  it('the sweep is looking at real files with real content', () => {
    // Guard against the whole suite passing because a rename made every
    // readFileSync return something empty or unrelated.
    for (const file of Object.keys(OWNED)) {
      const source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, file), 'utf8');
      expect(source.length).toBeGreaterThan(500);
      expect(source).toContain('getTranslator');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. LoginForm fans `messages` down to TenantSelector
// ---------------------------------------------------------------------------

describe('LoginForm → TenantSelector fan-out (TBP-634)', () => {
  it('passes messages down, the way it already does to MfaChallenge', () => {
    // Only reachable on the multi-workspace path, which needs auth state a
    // server render cannot produce — so this is asserted on the template. It is
    // the easiest of the fan-outs to forget precisely because it so rarely
    // renders.
    const source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, 'LoginForm.svelte'), 'utf8');
    const tag = source.match(/<TenantSelector[^>]*\/>/);
    expect(tag, 'LoginForm no longer renders <TenantSelector>').not.toBeNull();
    expect(tag![0]).toContain('{messages}');
  });
});

// ---------------------------------------------------------------------------
// 5. Every fan-out, not just the two anybody remembered
// ---------------------------------------------------------------------------

// TBP-634 called the LoginForm → TenantSelector fan-out "the one that is easy
// to forget", and named only that one — so <SsoButton> was rendered without
// `{messages}` and nothing noticed. A test naming its children one by one has
// the same blind spot as the ticket did: it can only catch the omissions
// somebody already thought of.
//
// So derive the list instead. Any child LoginForm renders that DECLARES a
// `messages` prop must be HANDED one; the set is read off the components
// themselves, so a new translatable child is covered the day it is added.
describe('LoginForm fans messages to every child that accepts it (TBP-634)', () => {
  const loginForm = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, 'LoginForm.svelte'), 'utf8');

  /** Child components LoginForm imports from this directory. */
  const imported = [...loginForm.matchAll(/import\s+(\w+)\s+from\s+'\.\/(\w+)\.svelte'/g)].map(
    (m) => m[1],
  );

  /** Of those, the ones whose own source declares a `messages` prop. */
  const translatable = imported.filter((name) => {
    const file = path.join(ROOT, COMPONENT_DIR, `${name}.svelte`);
    if (!fs.existsSync(file)) return false;
    return /messages\?:\s*MessageOverrides/.test(fs.readFileSync(file, 'utf8'));
  });

  it('finds the translatable children to check (guards the derivation itself)', () => {
    // If the regexes ever stop matching, every test below would vacuously pass
    // on an empty list. Anchor on the two the ticket named by hand.
    expect(translatable).toContain('TenantSelector');
    expect(translatable).toContain('SsoButton');
    expect(translatable.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * Every opening tag for `name`, self-closing or block.
   *
   * Scans to the closing `>` at brace depth 0 rather than regexing to the first
   * `>`: an inline handler like `onSetupPasskey={() => { step = 'x'; }}`
   * contains `>` and `{`, and a naive `[^>]*>` truncates the tag before the
   * props that follow it — which reports a component that IS threaded as one
   * that is not.
   */
  function openingTags(source: string, name: string): string[] {
    const found: string[] = [];
    const opener = new RegExp(`<${name}(?=[\\s/>])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = opener.exec(source)) !== null) {
      let depth = 0;
      for (let i = m.index; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) {
          found.push(source.slice(m.index, i + 1));
          break;
        }
      }
    }
    return found;
  }

  it('the tag scanner survives an inline arrow handler (guards the scanner)', () => {
    // PasskeyLogin is threaded AND carries `onSetupPasskey={() => { ... }}`, so
    // it is the case that breaks a naive scanner. If this ever reports a single
    // short tag, the it.each below is checking truncated strings.
    const tags = openingTags(loginForm, 'PasskeyLogin');
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]).toContain('onSetupPasskey');
    expect(tags[0]).toContain('{messages}');
  });

  it.each(translatable)('passes messages to <%s>', (name) => {
    const tags = openingTags(loginForm, name);
    expect(tags.length, `LoginForm no longer renders <${name}>`).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag, `<${name}> is rendered without {messages}`).toMatch(/\{messages\}|messages=/);
    }
  });
});
