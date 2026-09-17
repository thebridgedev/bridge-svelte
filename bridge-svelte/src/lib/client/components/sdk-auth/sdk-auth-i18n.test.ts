// TBP-630 translated the nine SDK-auth components below and shipped with one
// new test file — auth-form-description.test.ts — which tests the TBP-631
// description guard, not translation. TBP-633, the re-export commit, added no
// test at all. The only i18n coverage in the package was selector-i18n.test.ts,
// and that covers the THREE components TBP-634 added afterwards. So the nine
// TBP-630 actually shipped had no i18n test of any kind: nothing failed if a
// key stopped resolving, if English leaked back into a translated screen, or if
// the `messages` override quietly stopped being honoured.
//
// This file closes that gap. It asserts behaviour on REAL rendered markup, not
// on the source, wherever a render can reach the strings.
//
// HARNESS NOTE — see auth-form-description.test.ts for the full explanation of
// why these render through Svelte's server renderer rather than a DOM. Short
// version: this workspace has no DOM implementation, so `mount()` and therefore
// clicks are unavailable. Views that only a click can reach are produced by
// `seeded()`, which writes a throwaway copy of the component with ONLY the
// initial value of one state variable changed. Everything else — the template,
// every `t()` call, the wrapper — is untouched real source, and `seeded()`
// throws if its target is missing, so a rename fails loudly rather than
// silently testing the wrong branch.
//
// WHAT MAKES THESE ASSERTIONS DRIFT-PROOF
//
// Nothing here hardcodes an English or Swedish sentence. The forbidden and
// expected strings are read out of auth-core's `en` and `sv` catalogues at run
// time, and WHICH strings apply to a view is derived from what that view
// actually renders in English. Rewording a catalogue entry therefore cannot
// rot these tests, and — more importantly — cannot make them vacuous: the
// derivation is itself asserted non-empty per view, because a sweep that found
// nothing to forbid would otherwise pass in triumph.
//
// The assertion that matters is the NEGATIVE one. A component that rendered the
// Swedish string and the English one side by side would satisfy any
// `toContain(sv[key])`; what proves a translation is that the English is GONE.

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

// Deliberately NOT a `__seeded-` prefix. auth-form-description.test.ts clears
// every `__seeded-*` file in its own beforeAll, and would delete this file's
// copies out from under it if the two ran concurrently.
const SEED_PREFIX = '__i18n9-';

/** Every key in the catalogue, for the raw-key sweep. */
const ALL_KEYS = Object.keys(en) as MessageKey[];

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

type Seed = [from: string, to: string];
type AnyProps = Record<string, unknown>;

/** A copy of `file` with initial-state literals replaced, to reach a later view. */
function seeded(file: string, seeds: Seed[]): string {
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

/**
 * Point the shared config store at a locale.
 *
 * The components read locale off BridgeConfig rather than taking it as a prop,
 * so this is how a real app sets it. Loaded through the same Vite module graph
 * the components resolve, otherwise they would read a different store instance.
 */
async function setLocale(locale: string | undefined): Promise<void> {
  const mod = await server.ssrLoadModule('/src/lib/client/stores/config.store.ts');
  mod.bridgeConfig.initConfig({ appId: 'tbp-630-i18n-test', locale });
}

function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// The views under test
// ---------------------------------------------------------------------------

/**
 * One renderable screen of one component.
 *
 * `overrideKey` is a key that screen is KNOWN to render, used by the override
 * test. It is asserted present in Swedish before being overridden, so a key
 * that stops rendering fails the test rather than making it vacuous.
 */
interface View {
  label: string;
  file: string;
  props?: AnyProps;
  seeds?: Seed[];
  overrideKey: MessageKey;
}

const VIEWS: View[] = [
  // --- LoginForm: the credentials step plus the two sub-steps it hosts inline.
  {
    label: 'LoginForm (credentials)',
    file: 'LoginForm.svelte',
    overrideKey: 'login.submit',
  },
  {
    label: 'LoginForm (forgot-password step)',
    file: 'LoginForm.svelte',
    seeds: [["let step = $state<Step>('credentials');", "let step = $state<Step>('forgot-password');"]],
    overrideKey: 'forgot.headingRequest',
  },
  {
    label: 'LoginForm (magic-link step)',
    file: 'LoginForm.svelte',
    seeds: [["let step = $state<Step>('credentials');", "let step = $state<Step>('magic-link');"]],
    overrideKey: 'magicLink.heading',
  },

  // --- SignupForm
  {
    label: 'SignupForm (form)',
    file: 'SignupForm.svelte',
    props: { loginHref: '/login' },
    overrideKey: 'signup.heading',
  },
  {
    label: 'SignupForm (success)',
    file: 'SignupForm.svelte',
    props: { loginHref: '/login' },
    seeds: [
      ['let success = $state(false);', 'let success = $state(true);'],
      ["let email = $state('');", "let email = $state('user@example.com');"],
    ],
    overrideKey: 'signup.successHeading',
  },

  // --- ForgotPassword: request, the token-bearing set-password view, and sent.
  {
    label: 'ForgotPassword (request)',
    file: 'ForgotPassword.svelte',
    overrideKey: 'forgot.headingRequest',
  },
  {
    label: 'ForgotPassword (set new password)',
    file: 'ForgotPassword.svelte',
    props: { token: 'reset-token' },
    overrideKey: 'forgot.headingSet',
  },
  {
    label: 'ForgotPassword (email sent)',
    file: 'ForgotPassword.svelte',
    seeds: [['let emailSent = $state(false);', 'let emailSent = $state(true);']],
    overrideKey: 'forgot.emailSent',
  },

  // --- MagicLink. `loginHref` is what renders the back link, and without it the
  // sent view is a single sentence.
  {
    label: 'MagicLink (form)',
    file: 'MagicLink.svelte',
    props: { loginHref: '/login' },
    overrideKey: 'magicLink.heading',
  },
  {
    label: 'MagicLink (sent)',
    file: 'MagicLink.svelte',
    props: { loginHref: '/login' },
    seeds: [
      ['let sent = $state(false);', 'let sent = $state(true);'],
      ["let email = $state('');", "let email = $state('user@example.com');"],
    ],
    overrideKey: 'magicLink.sent',
  },

  // --- PasskeyLogin renders nothing until `supported` flips, and onMount does
  // not run in a server render, so the button is unreachable without this seed.
  {
    label: 'PasskeyLogin (button)',
    file: 'PasskeyLogin.svelte',
    seeds: [['let supported = $state(false);', 'let supported = $state(true);']],
    overrideKey: 'passkey.loginButton',
  },

  // --- PasskeySetup
  {
    label: 'PasskeySetup (loading)',
    file: 'PasskeySetup.svelte',
    props: { token: 'setup-token' },
    overrideKey: 'passkey.settingUpHeading',
  },
  {
    label: 'PasskeySetup (success)',
    file: 'PasskeySetup.svelte',
    props: { token: 'setup-token' },
    seeds: [["let viewState = $state<ViewState>('loading');", "let viewState = $state<ViewState>('success');"]],
    overrideKey: 'passkey.setupSuccessHeading',
  },

  // --- PasskeyRequestSetupLink
  {
    label: 'PasskeyRequestSetupLink (form)',
    file: 'PasskeyRequestSetupLink.svelte',
    props: { onBack: () => {}, initialEmail: 'user@example.com' },
    overrideKey: 'passkey.createHeading',
  },
  {
    label: 'PasskeyRequestSetupLink (sent)',
    file: 'PasskeyRequestSetupLink.svelte',
    props: { onBack: () => {}, initialEmail: 'user@example.com' },
    seeds: [["let view = $state<ViewState>('form');", "let view = $state<ViewState>('sent');"]],
    overrideKey: 'passkey.sentHeading',
  },

  // --- MfaChallenge
  {
    label: 'MfaChallenge (authentication code)',
    file: 'MfaChallenge.svelte',
    overrideKey: 'mfa.challengeHeading',
  },
  {
    label: 'MfaChallenge (recovery code)',
    file: 'MfaChallenge.svelte',
    seeds: [['let useRecovery = $state(false);', 'let useRecovery = $state(true);']],
    overrideKey: 'field.recoveryCode',
  },

  // --- MfaSetup: three steps, two of them behind a click.
  {
    label: 'MfaSetup (phone)',
    file: 'MfaSetup.svelte',
    overrideKey: 'mfaSetup.heading',
  },
  {
    label: 'MfaSetup (verify)',
    file: 'MfaSetup.svelte',
    seeds: [[STEP_STATE(), STEP_STATE('verify')]],
    overrideKey: 'field.verificationCode',
  },
  {
    label: 'MfaSetup (backup)',
    file: 'MfaSetup.svelte',
    seeds: [
      [STEP_STATE(), STEP_STATE('backup')],
      ['let backupCode = $state<string | null>(null);', "let backupCode = $state<string | null>('ABCD-1234');"],
    ],
    overrideKey: 'mfaSetup.successHeading',
  },
];

function STEP_STATE(step: 'phone' | 'verify' | 'backup' = 'phone'): string {
  return `let step = $state<'phone' | 'verify' | 'backup'>('${step}');`;
}

/** The nine components TBP-630 translated, derived from the view table. */
const NINE = [...new Set(VIEWS.map((v) => v.file))];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Module id for a view. Memoised: the seeded copy is locale-independent (locale
 * is read off the config store at render time), so one copy per view serves
 * every locale instead of littering the directory with one per assertion.
 */
const idCache = new Map<string, string>();
function viewId(view: View): string {
  const cached = idCache.get(view.label);
  if (cached) return cached;
  const id = view.seeds ? seeded(view.file, view.seeds) : `/${COMPONENT_DIR}/${view.file}`;
  idCache.set(view.label, id);
  return id;
}

async function renderAt(view: View, locale: string | undefined, extra: AnyProps = {}): Promise<string> {
  await setLocale(locale);
  const mod = await server.ssrLoadModule(viewId(view));
  const Component = mod.default as Component<AnyProps>;
  return text(render(Component, { props: { ...view.props, ...extra } }).body);
}

/**
 * The comparable part of a catalogue entry.
 *
 * Interpolated copy is matched on its literal prefix: the catalogue holds
 * `Check your email — link expires in {expiry}.`, the render holds a real
 * duration in place of the placeholder.
 */
function needleOf(catalogue: typeof en, key: MessageKey): string {
  return catalogue[key].split('{')[0].trim();
}

/**
 * Keys whose `catalogue` value appears in `rendered`.
 *
 * Keys whose English and Swedish are identical are skipped — they can neither
 * prove nor disprove a translation. So is the one empty entry
 * (`placeholder.phoneNumber`, intentionally blank in every locale), which would
 * otherwise match every string ever rendered.
 */
function matched(rendered: string, catalogue: typeof en): MessageKey[] {
  return ALL_KEYS.filter((k) => {
    if (!en[k] || !sv[k] || en[k] === sv[k]) return false;
    const needle = needleOf(catalogue, k);
    return needle.length >= 3 && rendered.includes(needle);
  });
}

/**
 * The subset of `matched` that the rendered text can actually attribute to ONE
 * key.
 *
 * Two kinds of ambiguity make a naive match lie, and both are real here:
 *
 * - **One entry contains another.** `mfaSetup.sendCode` is "Skicka kod", and
 *   `action.resendCode` is "Skicka koden igen." — a screen showing only the
 *   resend prompt looks like it is showing both.
 * - **Two entries are identical in one language but not the other.**
 *   `action.backToLogin` and `action.backToSignIn` are both "Tillbaka till
 *   inloggningen" in Swedish, but "Back to login" and "Back to sign in" in
 *   English. Seeing the Swedish proves nothing about which English to expect.
 *
 * Either way the render cannot tell the keys apart, so neither can a test.
 * Dropping them keeps the assertions true rather than approximately true.
 */
function unambiguous(keys: MessageKey[], catalogue: typeof en): MessageKey[] {
  return keys.filter((k) => {
    const needle = needleOf(catalogue, k);
    // `includes` covers equality, so identical entries drop each other — which
    // is the intent: neither can be attributed.
    return !keys.some((other) => other !== k && needleOf(catalogue, other).includes(needle));
  });
}

// ===========================================================================
// 1. At locale sv, no English sentence from the catalogue survives
// ===========================================================================

describe('the nine TBP-630 components render Swedish, with no English left behind', () => {
  for (const view of VIEWS) {
    it(`${view.label} leaves no English string on screen at locale sv`, async () => {
      const english = await renderAt(view, undefined);
      const swedish = await renderAt(view, 'sv');

      const englishKeys = matched(english, en);

      // Guard the derivation. An empty list would make every assertion below
      // vacuous, and a view that silently stopped rendering (a required prop
      // added, a template branch inverted) is exactly how that happens.
      expect(
        englishKeys.length,
        `${view.label} rendered no recognisable catalogue string in English — ` +
          'the view is no longer reaching its copy, so this test is not testing anything',
      ).toBeGreaterThanOrEqual(2);

      // The forbidden set is deliberately the BROAD match, not the
      // disambiguated one. Every one of these English strings is on screen in
      // English, so every one of them must be gone in Swedish; ambiguity about
      // WHICH key produced it does not make its survival acceptable.
      for (const key of englishKeys) {
        const needle = needleOf(en, key);
        expect(
          swedish,
          `${view.label} still shows the English ${key} ("${needle}") at locale sv`,
        ).not.toContain(needle);
      }

      // And the Swedish really did arrive. Without this, a component that
      // rendered an empty screen in Swedish would pass the sweep above.
      const swedishKeys = unambiguous(matched(swedish, sv), sv);
      expect(
        swedishKeys.length,
        `${view.label} shows no catalogue Swedish at locale sv`,
      ).toBeGreaterThanOrEqual(1);
    });
  }
});

// ===========================================================================
// 2. A raw key never reaches the screen, in any locale
// ===========================================================================

describe('the nine TBP-630 components never render a raw message key', () => {
  // 'klingon' is invented rather than a real-but-unshipped code on purpose:
  // TBP-632 turned 'de' and 'fr' into shipped locales and broke every test that
  // had borrowed one as its stand-in for "unknown". 'de' is kept here as a
  // shipped non-English locale, which is a different case.
  const LOCALES: Array<string | undefined> = ['sv', 'de', 'klingon', undefined];

  for (const view of VIEWS) {
    it(`${view.label} resolves every key, including in an unknown locale`, async () => {
      for (const locale of LOCALES) {
        const rendered = await renderAt(view, locale);
        for (const key of ALL_KEYS) {
          expect(
            rendered,
            `${view.label} printed the raw key "${key}" at locale ${locale ?? '(none)'}`,
          ).not.toContain(key);
        }
        // A screen that rendered nothing cannot print a raw key either, so the
        // sweep above needs something to sweep.
        expect(rendered.length, `${view.label} rendered nothing at locale ${locale ?? '(none)'}`)
          .toBeGreaterThan(10);
      }
    });
  }
});

// ===========================================================================
// 3. With no locale set, the output is the English the catalogue defines
// ===========================================================================

// The non-breaking-change AC. TBP-630 moved every string in these nine
// components out of the markup and into the catalogue; an app that never sets
// `locale` must see exactly what it saw before, and it must come FROM the
// catalogue rather than from a literal left behind in the template.
describe('the nine TBP-630 components are unchanged for an app that sets no locale', () => {
  for (const view of VIEWS) {
    it(`${view.label} renders the catalogue English when no locale is set`, async () => {
      const swedish = await renderAt(view, 'sv');
      const english = await renderAt(view, undefined);

      // Derive from the SWEDISH render, so the expectation is not circular:
      // seeing the Swedish proves the string came through the translator on
      // this screen, and the English render must then be showing that same
      // key's catalogue English.
      const live = unambiguous(matched(swedish, sv), sv);

      expect(
        live.length,
        `${view.label} rendered no attributable Swedish string — nothing to check`,
      ).toBeGreaterThanOrEqual(1);

      for (const key of live) {
        const needle = needleOf(en, key);
        expect(
          english,
          `${view.label} does not show the catalogue English for ${key} ("${needle}") ` +
            'when no locale is set',
        ).toContain(needle);
      }
    });
  }
});

// ===========================================================================
// 4. A per-key `messages` override beats the locale
// ===========================================================================

describe('a per-key messages override beats the locale, in every component', () => {
  for (const view of VIEWS) {
    it(`${view.label} honours messages.${view.overrideKey} over locale sv`, async () => {
      const key = view.overrideKey;
      const swedishNeedle = sv[key].split('{')[0].trim();

      // Anchor: this key must genuinely render on this screen, or the override
      // assertion below proves nothing.
      const before = await renderAt(view, 'sv');
      expect(
        before,
        `${view.label} no longer renders ${key} — pick a key this view still shows`,
      ).toContain(swedishNeedle);

      const override = `ÖVERSTYRD ${key}`;
      const after = await renderAt(view, 'sv', { messages: { [key]: override } });

      expect(after, `${view.label} ignored the messages override for ${key}`).toContain(override);
      expect(
        after,
        `${view.label} rendered the locale value for ${key} despite an override`,
      ).not.toContain(swedishNeedle);
    });
  }
});

// ===========================================================================
// 5. Error copy, reached by seeding the error slot
// ===========================================================================

// These strings are produced inside catch blocks that a click would have to
// reach, so the renderer cannot get to them on its own. Each case seeds the
// component's error state with `t('<key>')` — the real translator, called from
// inside the real component — and asserts the Swedish arrives and the English
// does not. Reverting the handler to an English literal is caught by the source
// sweep in section 6, which is the half that survives this seeding.
describe('error copy in the nine resolves through the catalogue (TBP-630)', () => {
  const ERROR_SLOT = 'let error = $state<string | null>(null);';

  const CASES: Array<{ file: string; key: MessageKey; extra?: Seed[]; props?: AnyProps }> = [
    { file: 'LoginForm.svelte', key: 'login.error.invalidCredentials' },
    { file: 'LoginForm.svelte', key: 'magicLink.error.auth' },
    { file: 'SignupForm.svelte', key: 'signup.error.create', props: { loginHref: '/login' } },
    { file: 'ForgotPassword.svelte', key: 'forgot.error.send' },
    { file: 'ForgotPassword.svelte', key: 'forgot.error.mismatch' },
    { file: 'ForgotPassword.svelte', key: 'forgot.error.tooShort' },
    { file: 'MagicLink.svelte', key: 'magicLink.error.send' },
    {
      file: 'PasskeyLogin.svelte',
      key: 'passkey.error.authCancelled',
      extra: [['let supported = $state(false);', 'let supported = $state(true);']],
    },
    {
      file: 'PasskeyRequestSetupLink.svelte',
      key: 'passkey.error.sendLink',
      props: { onBack: () => {}, initialEmail: 'user@example.com' },
    },
    { file: 'MfaChallenge.svelte', key: 'mfa.error.invalidCode' },
    { file: 'MfaSetup.svelte', key: 'mfaSetup.error.sendCode' },
  ];

  for (const { file, key, extra, props } of CASES) {
    it(`${file} renders ${key} in Swedish`, async () => {
      const seeds: Seed[] = [
        [ERROR_SLOT, ERROR_SLOT.replace('(null)', `(t('${key}'))`)],
        ...(extra ?? []),
      ];
      const view: View = { label: `${file}:${key}`, file, props, seeds, overrideKey: key };
      const swedish = await renderAt(view, 'sv');
      expect(swedish).toContain(sv[key].split('{')[0].trim());
      expect(swedish).not.toContain(en[key].split('{')[0].trim());
    });
  }

  // PasskeySetup keeps its error copy in the template rather than in the error
  // slot, one branch per classified failure, so it is reached by seeding the
  // view instead.
  const PASSKEY_VIEW = "let viewState = $state<ViewState>('loading');";
  const PASSKEY_TYPE = "let errorType = $state<ErrorType>('general');";

  const PASSKEY_CASES: Array<{ type: string; key: MessageKey }> = [
    { type: 'expired', key: 'passkey.error.expired' },
    { type: 'cancelled', key: 'passkey.error.cancelled' },
    { type: 'unsupported', key: 'passkey.error.unsupported' },
    { type: 'general', key: 'passkey.error.setup' },
  ];

  for (const { type, key } of PASSKEY_CASES) {
    it(`PasskeySetup renders ${key} in Swedish`, async () => {
      const view: View = {
        label: `PasskeySetup:${key}`,
        file: 'PasskeySetup.svelte',
        props: { token: 'setup-token' },
        seeds: [
          [PASSKEY_VIEW, PASSKEY_VIEW.replace("('loading')", "('error')")],
          [PASSKEY_TYPE, PASSKEY_TYPE.replace("('general')", `('${type}')`)],
        ],
        overrideKey: key,
      };
      const swedish = await renderAt(view, 'sv');
      expect(swedish).toContain(sv[key].split('{')[0].trim());
      expect(swedish).not.toContain(en[key].split('{')[0].trim());
    });
  }
});

// ===========================================================================
// 6. Source sweep — the half that survives a reverted error handler
// ===========================================================================

// Section 5 proves the KEY resolves, but it supplies the key itself, so it
// cannot tell whether the handler still calls `t()`. This does: reverting
// `authErrorMessage(err, t, 'signup.error.create')` to `'Failed to create
// account.'` puts that exact English sentence back into the source, and the
// sweep fails. The forbidden strings are read out of `en`, so they cannot drift
// from what the keys actually say.
//
// Scoped to error keys deliberately. A sweep over the whole catalogue matches
// nineteen benign substrings across these files — `handleVerify` contains
// "Verify", a JSDoc paragraph quotes "Log in to your account" while explaining
// TBP-537 — and a test that has to carry an exception list for its own false
// positives is a test nobody will trust. Every string below was checked to have
// no such collision.
describe('no English error literal remains in the nine components (TBP-630)', () => {
  const OWNED_ERRORS: Record<string, MessageKey[]> = {
    'LoginForm.svelte': [
      'login.error.invalidCredentials',
      'forgot.error.send',
      'magicLink.error.send',
      'magicLink.error.auth',
    ],
    'SignupForm.svelte': ['signup.error.create'],
    'ForgotPassword.svelte': [
      'forgot.error.send',
      'forgot.error.mismatch',
      'forgot.error.tooShort',
      'forgot.error.update',
    ],
    'MagicLink.svelte': ['magicLink.error.send'],
    'PasskeyLogin.svelte': ['passkey.error.authCancelled', 'passkey.error.auth'],
    'PasskeySetup.svelte': [
      'passkey.error.verify',
      'passkey.error.expired',
      'passkey.error.cancelled',
      'passkey.error.unsupported',
      'passkey.error.setup',
    ],
    'PasskeyRequestSetupLink.svelte': ['passkey.error.sendLink'],
    'MfaChallenge.svelte': [
      'mfa.error.resend',
      'mfa.error.invalidCode',
      'mfa.error.invalidRecoveryCode',
    ],
    'MfaSetup.svelte': ['mfaSetup.error.sendCode', 'mfaSetup.error.resend'],
  };

  it('names all nine components — the table is the scope of this sweep', () => {
    expect(Object.keys(OWNED_ERRORS).sort()).toEqual([...NINE].sort());
  });

  for (const [file, keys] of Object.entries(OWNED_ERRORS)) {
    it(`${file} carries none of its English error strings as a literal`, () => {
      const source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, file), 'utf8');
      for (const key of keys) {
        const needle = en[key].split('{')[0].trim();
        expect(needle.length, `${key} has no comparable literal prefix`).toBeGreaterThan(8);
        expect(source, `${file} still contains the English literal "${needle}"`).not.toContain(
          needle,
        );
      }
    });
  }

  it('the sweep is looking at real files with real content', () => {
    // Guard against the whole section passing because a rename made every
    // readFileSync return something empty or unrelated.
    for (const file of NINE) {
      const source = fs.readFileSync(path.join(ROOT, COMPONENT_DIR, file), 'utf8');
      expect(source.length).toBeGreaterThan(500);
      expect(source, `${file} no longer calls getTranslator`).toContain('getTranslator');
      expect(source, `${file} no longer declares a messages prop`).toMatch(
        /messages\?:\s*MessageOverrides/,
      );
    }
  });
});
