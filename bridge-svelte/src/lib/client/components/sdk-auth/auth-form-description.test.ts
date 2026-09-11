// Regression: `heading={null}` suppressed the heading but NOT the
// `<p class="bridge-step-desc">` description, which lived in each component's
// markup outside AuthFormWrapper's guard. A host app that wrote its own page
// title + subtitle got Bridge's description printed underneath — the same
// sentence twice, in two voices (TBP-631, live in NorthWhistle on
// /auth/magic-link and /auth/forgot-password). 2026-09-11.
//
// HARNESS NOTE — how these render the REAL components, and why.
//
// bridge-svelte's vitest config runs in a `node` environment and there is no
// DOM implementation anywhere in the workspace (jsdom / happy-dom / linkedom /
// @testing-library/svelte are all absent), so `mount()` is unavailable. What IS
// available is Svelte 5's server renderer: this file boots a single in-process
// Vite server with @sveltejs/vite-plugin-svelte, `ssrLoadModule`s the actual
// .svelte files, and renders them with `render()` from 'svelte/server'. The
// markup asserted below is therefore produced by the shipped components and the
// shipped AuthFormWrapper — not by a replica of their logic.
//
// Three views are gated behind private `$state` that only a user interaction
// can flip (MfaSetup's 'verify'/'backup' steps, PasskeyRequestSetupLink's
// 'sent' view, SignupForm's success view, MagicLink/ForgotPassword post-send).
// Without a DOM those clicks cannot happen, so `seeded()` writes a throwaway
// copy of the component next to the original with ONLY the initial value of
// that one state variable changed, and renders that. The template, the
// description guards and the wrapper call are untouched real source. `seeded()`
// throws if a seed target is missing, so a rename fails the suite loudly rather
// than silently testing the wrong branch.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { render } from 'svelte/server';
import { createRawSnippet, type Component } from 'svelte';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMPONENT_DIR = 'src/lib/client/components/sdk-auth';
const SEED_PREFIX = '__seeded-';

let server: ViteDevServer;
const seededPaths: string[] = [];

beforeAll(async () => {
  // Clear anything a crashed previous run left behind.
  for (const f of fs.readdirSync(path.join(ROOT, COMPONENT_DIR))) {
    if (f.startsWith(SEED_PREFIX)) fs.unlinkSync(path.join(ROOT, COMPONENT_DIR, f));
  }
  server = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    // dev:false — the dev-mode server renderer expects a component dev stack
    // that render() outside a SvelteKit request does not provide.
    plugins: [svelte({ compilerOptions: { dev: false } })],
  });
}, 120_000);

afterAll(async () => {
  await server?.close();
  for (const p of seededPaths) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

/** Module id of an unmodified component, for `renderComponent`. */
function componentId(file: string): string {
  return `/${COMPONENT_DIR}/${file}`;
}

/**
 * Module id of a copy of `file` with the given initial-state literals replaced.
 * Used only to reach views that a click would otherwise have to produce.
 */
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

// ---------------------------------------------------------------------------
// Assertion helpers — read the rendered HTML, not the source.
// ---------------------------------------------------------------------------

const DESC_RE = /<p class="bridge-step-desc">([\s\S]*?)<\/p>/g;
const HEADING_RE = /<h2 class="bridge-auth-heading">([\s\S]*?)<\/h2>/g;
const SUCCESS_HEADING_RE = /<h2 class="bridge-success-heading">([\s\S]*?)<\/h2>/g;

function stripMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Inner HTML of every `<p class="bridge-step-desc">` in render order. */
function descriptionHtml(html: string): string[] {
  return [...html.matchAll(DESC_RE)].map((m) => m[1]);
}

/** Visible text of every description paragraph, in render order. */
function descriptionText(html: string): string[] {
  return descriptionHtml(html).map(stripMarkup);
}

function headingText(html: string): string[] {
  return [...html.matchAll(HEADING_RE)].map((m) => stripMarkup(m[1]));
}

function successHeadingText(html: string): string[] {
  return [...html.matchAll(SUCCESS_HEADING_RE)].map((m) => stripMarkup(m[1]));
}

/**
 * The element must be gone entirely — not present-but-empty. Asserting on the
 * class substring rather than the regex catches `<p class="bridge-step-desc">
 * </p>`, which still holds vertical space and is the exact thing TBP-631 had to
 * avoid.
 */
function expectNoDescriptionElement(html: string) {
  expect(html).not.toContain('bridge-step-desc');
}

const MAGIC_LINK_DESC = "Enter your email and we'll send you a sign-in link. No password needed.";
const FORGOT_DESC = "Enter your email and we'll send you a link to reset your password.";
const MFA_DESC = {
  phone: 'Enter your phone number to receive a verification code via SMS.',
  verify: 'Enter the 6-digit code sent to your phone.',
  backup:
    'Save this recovery code in a safe place. You can use it to access your account if you lose your phone.',
} as const;
const PASSKEY_SETUP_DESC =
  'Follow the prompt from your browser or device to complete passkey setup.';
const PASSKEY_REQUEST_FORM_DESC =
  'Enter your email and we will send a link to create your passkey.';

// ===========================================================================
// AuthFormWrapper — the guard itself
// ===========================================================================

describe('AuthFormWrapper description guard', () => {
  const children = createRawSnippet(() => ({
    render: () => '<form id="wrapper-children"></form>',
  }));

  it('renders heading and description together by default', async () => {
    const html = await renderComponent(componentId('shared/AuthFormWrapper.svelte'), {
      heading: 'My heading',
      description: 'My description',
      children,
    });
    expect(headingText(html)).toEqual(['My heading']);
    expect(descriptionText(html)).toEqual(['My description']);
  });

  it('heading={null} drops the heading and keeps the description', async () => {
    const html = await renderComponent(componentId('shared/AuthFormWrapper.svelte'), {
      heading: null,
      description: 'My description',
      children,
    });
    expect(html).not.toContain('bridge-auth-heading');
    expect(descriptionText(html)).toEqual(['My description']);
  });

  it('description={null} drops the description element and keeps the heading', async () => {
    const html = await renderComponent(componentId('shared/AuthFormWrapper.svelte'), {
      heading: 'My heading',
      description: null,
      children,
    });
    expectNoDescriptionElement(html);
    expect(headingText(html)).toEqual(['My heading']);
  });

  it("description='' is treated as suppression, same as null", async () => {
    const html = await renderComponent(componentId('shared/AuthFormWrapper.svelte'), {
      heading: 'My heading',
      description: '',
      children,
    });
    expectNoDescriptionElement(html);
    expect(headingText(html)).toEqual(['My heading']);
  });

  it('suppressing both leaves the wrapper and its children intact', async () => {
    const html = await renderComponent(componentId('shared/AuthFormWrapper.svelte'), {
      heading: null,
      description: null,
      children,
    });
    expect(html).not.toContain('bridge-auth-heading');
    expectNoDescriptionElement(html);
    expect(html).toContain('data-bridge-auth-form');
    expect(html).toContain('id="wrapper-children"');
  });

  it('descriptionSnippet carries markup and wins over the description string', async () => {
    const descriptionSnippet = createRawSnippet(() => ({
      render: () => '<p class="bridge-step-desc">Sent to <strong>a@b.com</strong>.</p>',
    }));
    const html = await renderComponent(componentId('shared/AuthFormWrapper.svelte'), {
      heading: 'My heading',
      description: 'plain string that must lose',
      descriptionSnippet,
      children,
    });
    expect(descriptionHtml(html)).toEqual(['Sent to <strong>a@b.com</strong>.']);
    expect(html).not.toContain('plain string that must lose');
  });
});

// ===========================================================================
// MagicLink — description lifted into the wrapper
// ===========================================================================

describe('MagicLink description', () => {
  const ID = componentId('MagicLink.svelte');

  it('renders the built-in heading and description when neither prop is passed', async () => {
    const html = await renderComponent(ID);
    expect(headingText(html)).toEqual(['Sign in with email link']);
    expect(descriptionText(html)).toEqual([MAGIC_LINK_DESC]);
  });

  it('heading={null} removes the heading but leaves the description', async () => {
    const html = await renderComponent(ID, { heading: null });
    expect(html).not.toContain('bridge-auth-heading');
    expect(descriptionText(html)).toEqual([MAGIC_LINK_DESC]);
  });

  it('description={null} removes the description element but leaves the heading and form', async () => {
    const html = await renderComponent(ID, { description: null });
    expectNoDescriptionElement(html);
    expect(headingText(html)).toEqual(['Sign in with email link']);
    expect(html).toContain('id="magic-email"');
  });

  it('suppressing both leaves no heading, no description and no empty paragraph', async () => {
    const html = await renderComponent(ID, { heading: null, description: null });
    expect(html).not.toContain('bridge-auth-heading');
    expectNoDescriptionElement(html);
    expect(html).toContain('data-bridge-auth-form');
    expect(html).toContain('id="magic-email"');
  });

  it('a string override replaces the built-in description', async () => {
    const html = await renderComponent(ID, { description: 'We will email you a link.' });
    expect(descriptionText(html)).toEqual(['We will email you a link.']);
    expect(html).not.toContain(MAGIC_LINK_DESC);
    expect(headingText(html)).toEqual(['Sign in with email link']);
  });

  it('suppresses the description on the post-send view even when it was not overridden', async () => {
    const html = await renderComponent(seeded('MagicLink.svelte', [['let sent = $state(false);', 'let sent = $state(true);']]));
    expectNoDescriptionElement(html);
    expect(html).not.toContain('bridge-auth-heading');
    expect(stripMarkup(html)).toContain('Check your email');
  });
});

// ===========================================================================
// ForgotPassword — description lifted, send-link step only
// ===========================================================================

describe('ForgotPassword description', () => {
  const ID = componentId('ForgotPassword.svelte');

  it('renders the built-in heading and description when neither prop is passed', async () => {
    const html = await renderComponent(ID);
    expect(headingText(html)).toEqual(['Reset your password']);
    expect(descriptionText(html)).toEqual([FORGOT_DESC]);
  });

  it('heading={null} removes the heading but leaves the description', async () => {
    const html = await renderComponent(ID, { heading: null });
    expect(html).not.toContain('bridge-auth-heading');
    expect(descriptionText(html)).toEqual([FORGOT_DESC]);
  });

  it('description={null} removes the description element but leaves the heading and form', async () => {
    const html = await renderComponent(ID, { description: null });
    expectNoDescriptionElement(html);
    expect(headingText(html)).toEqual(['Reset your password']);
    expect(html).toContain('id="reset-email"');
  });

  it('suppressing both leaves no heading, no description and no empty paragraph', async () => {
    const html = await renderComponent(ID, { heading: null, description: null });
    expect(html).not.toContain('bridge-auth-heading');
    expectNoDescriptionElement(html);
    expect(html).toContain('data-bridge-auth-form');
    expect(html).toContain('id="reset-email"');
  });

  it('a string override replaces the built-in description', async () => {
    const html = await renderComponent(ID, { description: 'Tell us your email.' });
    expect(descriptionText(html)).toEqual(['Tell us your email.']);
    expect(html).not.toContain(FORGOT_DESC);
  });

  it('carries no description in set-password mode, and an override cannot force one in', async () => {
    const withToken = await renderComponent(ID, { token: 'reset-token' });
    expectNoDescriptionElement(withToken);
    expect(headingText(withToken)).toEqual(['Set new password']);
    expect(withToken).toContain('id="newPassword"');

    const overridden = await renderComponent(ID, {
      token: 'reset-token',
      description: 'Should not appear on this step.',
    });
    expectNoDescriptionElement(overridden);
    expect(headingText(overridden)).toEqual(['Set new password']);
  });

  it('drops the description once the reset email has been sent', async () => {
    const html = await renderComponent(
      seeded('ForgotPassword.svelte', [['let emailSent = $state(false);', 'let emailSent = $state(true);']]),
    );
    expectNoDescriptionElement(html);
    expect(html).not.toContain('bridge-auth-heading');
    expect(stripMarkup(html)).toContain('Check your email for a password reset link.');
  });
});

// ===========================================================================
// MfaSetup — three step descriptions, one wrapper
// ===========================================================================

describe('MfaSetup description', () => {
  const STEP_STATE = "let step = $state<'phone' | 'verify' | 'backup'>('phone');";
  const HEADING = 'Set up two-factor authentication';

  /** 'phone' is the initial state; the other two need seeding. */
  function stepId(step: 'phone' | 'verify' | 'backup'): string {
    if (step === 'phone') return componentId('MfaSetup.svelte');
    return seeded('MfaSetup.svelte', [
      [STEP_STATE, STEP_STATE.replace("('phone')", `('${step}')`)],
    ]);
  }

  const ANCHOR = {
    phone: 'id="mfa-phone"',
    verify: 'id="mfa-verify-code"',
    backup: 'Two-factor authentication enabled!',
  } as const;

  for (const step of ['phone', 'verify', 'backup'] as const) {
    describe(`step "${step}"`, () => {
      it('renders that step\'s own built-in description', async () => {
        const html = await renderComponent(stepId(step));
        expect(descriptionText(html)).toEqual([MFA_DESC[step]]);
        expect(headingText(html)).toEqual([HEADING]);
        expect(html).toContain(ANCHOR[step]);
      });

      it('description={null} removes it while the step body still renders', async () => {
        const html = await renderComponent(stepId(step), { description: null });
        expectNoDescriptionElement(html);
        expect(headingText(html)).toEqual([HEADING]);
        expect(html).toContain(ANCHOR[step]);
      });

      it('a single string override applies to this step', async () => {
        const html = await renderComponent(stepId(step), { description: 'One line for every step.' });
        expect(descriptionText(html)).toEqual(['One line for every step.']);
        expect(html).not.toContain(MFA_DESC[step]);
        expect(html).toContain(ANCHOR[step]);
      });
    });
  }
});

// ===========================================================================
// PasskeyRequestSetupLink — two views, two wrappers
// ===========================================================================

describe('PasskeyRequestSetupLink description', () => {
  const FORM_ID = componentId('PasskeyRequestSetupLink.svelte');
  const baseProps = { onBack: () => {}, initialEmail: 'user@example.com' };

  function sentId(): string {
    return seeded('PasskeyRequestSetupLink.svelte', [
      ["let view = $state<ViewState>('form');", "let view = $state<ViewState>('sent');"],
    ]);
  }

  describe("view 'form'", () => {
    it('renders the built-in description', async () => {
      const html = await renderComponent(FORM_ID, baseProps);
      expect(descriptionText(html)).toEqual([PASSKEY_REQUEST_FORM_DESC]);
      expect(headingText(html)).toEqual(['Create a passkey']);
    });

    it('description={null} removes it while the form still renders', async () => {
      const html = await renderComponent(FORM_ID, { ...baseProps, description: null });
      expectNoDescriptionElement(html);
      expect(headingText(html)).toEqual(['Create a passkey']);
      expect(html).toContain('id="passkey-request-email"');
    });

    it('a string override replaces the built-in description', async () => {
      const html = await renderComponent(FORM_ID, { ...baseProps, description: 'We will email a link.' });
      expect(descriptionText(html)).toEqual(['We will email a link.']);
      expect(html).not.toContain(PASSKEY_REQUEST_FORM_DESC);
    });
  });

  describe("view 'sent'", () => {
    it('renders the built-in description through the snippet, keeping the <strong> email', async () => {
      const html = await renderComponent(sentId(), baseProps);
      expect(descriptionHtml(html)).toEqual([
        'We sent a passkey setup link to <strong>user@example.com</strong>. Please check your inbox and click the link to create your passkey and finish signing in.',
      ]);
      expect(headingText(html)).toEqual(['Check your email']);
    });

    it('description={null} removes it while the heading and back button still render', async () => {
      const html = await renderComponent(sentId(), { ...baseProps, description: null });
      expectNoDescriptionElement(html);
      expect(headingText(html)).toEqual(['Check your email']);
      expect(stripMarkup(html)).toContain('Back to login');
    });

    it('a string override replaces the snippet, losing the <strong> emphasis', async () => {
      const html = await renderComponent(sentId(), { ...baseProps, description: 'Link sent. Check your inbox.' });
      expect(descriptionHtml(html)).toEqual(['Link sent. Check your inbox.']);
      expect(html).not.toContain('<strong>');
      expect(headingText(html)).toEqual(['Check your email']);
    });
  });
});

// ===========================================================================
// SignupForm — guarded in place, below the success heading (NOT lifted)
// ===========================================================================

describe('SignupForm description', () => {
  const SEEDS: Array<[string, string]> = [
    ['let success = $state(false);', 'let success = $state(true);'],
    ["let email = $state('');", "let email = $state('user@example.com');"],
  ];
  function successId(): string {
    return seeded('SignupForm.svelte', SEEDS);
  }
  const baseProps = { loginHref: '/login' };

  it('the pre-submit form carries no description at all', async () => {
    const html = await renderComponent(componentId('SignupForm.svelte'), baseProps);
    expectNoDescriptionElement(html);
    expect(headingText(html)).toEqual(['Create your account']);
    expect(html).toContain('id="signup-email"');
  });

  it('keeps the <strong> email in the default success description', async () => {
    const html = await renderComponent(successId(), baseProps);
    expect(descriptionHtml(html)).toEqual([
      'We sent a verification link to <strong>user@example.com</strong>. Check your inbox to activate your account.',
    ]);
    expect(successHeadingText(html)).toEqual(['Check your email']);
  });

  it('renders the description below the success heading it belongs to, not above it', async () => {
    const html = await renderComponent(successId(), baseProps);
    expect(html.indexOf('bridge-success-heading')).toBeGreaterThan(-1);
    expect(html.indexOf('bridge-step-desc')).toBeGreaterThan(html.indexOf('bridge-success-heading'));
  });

  it('a string override replaces the default and loses the <strong> emphasis', async () => {
    const html = await renderComponent(successId(), {
      ...baseProps,
      description: 'Check your inbox to finish signing up.',
    });
    expect(descriptionHtml(html)).toEqual(['Check your inbox to finish signing up.']);
    expect(html).not.toContain('<strong>');
    expect(successHeadingText(html)).toEqual(['Check your email']);
  });

  it('description={null} removes it while the success heading and footer still render', async () => {
    const html = await renderComponent(successId(), { ...baseProps, description: null });
    expectNoDescriptionElement(html);
    expect(successHeadingText(html)).toEqual(['Check your email']);
    expect(html).toContain('href="/login"');
  });
});

// ===========================================================================
// PasskeySetup — guarded in place, inside the loading indicator (NOT lifted)
// ===========================================================================

describe('PasskeySetup description', () => {
  const ID = componentId('PasskeySetup.svelte');
  const baseProps = { token: 'setup-token' };
  const LOADING_RE = /<div class="bridge-passkey-loading">([\s\S]*?)<\/div>/;

  function loadingBlock(html: string): string {
    const m = html.match(LOADING_RE);
    if (!m) throw new Error('bridge-passkey-loading block not rendered');
    return m[1];
  }

  it('renders the built-in description inside the loading indicator, next to the spinner', async () => {
    const html = await renderComponent(ID, baseProps);
    const block = loadingBlock(html);
    expect(block).toContain('data-bridge-spinner');
    expect(descriptionText(block)).toEqual([PASSKEY_SETUP_DESC]);
    expect(headingText(html)).toEqual(['Setting up passkey']);
  });

  it('description={null} removes the paragraph but keeps the spinner', async () => {
    const html = await renderComponent(ID, { ...baseProps, description: null });
    expectNoDescriptionElement(html);
    expect(loadingBlock(html)).toContain('data-bridge-spinner');
    expect(headingText(html)).toEqual(['Setting up passkey']);
  });

  it('a string override replaces the built-in description', async () => {
    const html = await renderComponent(ID, { ...baseProps, description: 'Confirm on your device.' });
    const block = loadingBlock(html);
    expect(descriptionText(block)).toEqual(['Confirm on your device.']);
    expect(block).toContain('data-bridge-spinner');
    expect(html).not.toContain(PASSKEY_SETUP_DESC);
  });
});
