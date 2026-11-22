import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Enter submits every end-user form, once, and nothing submits by itself.
 *
 * In a browser, Enter in a field submits its form through the form's submit button (or, with one field, with no
 * button). So the gap that would break it is structural, and this test holds the structure of every end-user screen:
 * every text field is inside a `<form onsubmit>`; the form has a submit button that is not the show/hide toggle;
 * the submit handler stops a second press while it works; and no field submits on input or on a key by itself, not even
 * a code field when its last digit is typed.
 */

const folders = ['.', '../team'].map((each) => new URL(each + '/', import.meta.url));
const SCREENS = [
  'SignInForm',
  'SignUpForm',
  'VerifyEmail',
  'SetPassword',
  'ForgotPassword',
  'HandoffSignIn',
  'RecheckDialog',
  'PasskeyManager',
  'ProfileForm',
].map((name) => ({ name, source: folders.map((f) => { try { return readFileSync(new URL(`${name}.svelte`, f), 'utf8'); } catch { return null; } }).find((x) => x !== null) as string }));

/** The `<form ...>...</form>` blocks of a screen. */
function forms(source: string): string[] {
  return [...source.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

/** The screen without its forms: what is left must hold no text field. */
function outside(source: string): string {
  return source.replace(/<form\b[\s\S]*?<\/form>/g, '');
}

const TEXT_FIELD = /<(input|PasswordInput|PhoneInput)\b(?![^>]*type="(checkbox|radio|button|submit|hidden)")/;

describe('Enter submits every end-user screen', () => {
  it.each(SCREENS.map((s) => [s.name, s.source]))('%s: every text field is inside a form that submits', (_, source) => {
    expect(source).toBeTruthy();
    const all = forms(source);
    expect(all.length).toBeGreaterThan(0);
    expect(outside(source)).not.toMatch(TEXT_FIELD);
    for (const form of all) {
      expect(form).toMatch(/<form\b[^>]*onsubmit=/);
      // A submit button of the form's own (the show/hide toggle is type="button"), or one field alone.
      const fields = form.match(new RegExp(TEXT_FIELD.source, 'g')) ?? [];
      expect(/<button[^>]*type="submit"/.test(form) || fields.length === 1).toBe(true);
    }
  });

  it.each(SCREENS.map((s) => [s.name, s.source]))('%s: submits only on Enter or the button, never by itself', (_, source) => {
    // No field submits as it is typed, or on a key it watches for.
    expect(source).not.toMatch(/<(input|PasswordInput|PhoneInput)\b[^>]*\b(oninput|onkeyup|onkeydown|onkeypress)=/);
    expect(source).not.toMatch(/\$effect\([^)]*submit/);
    expect(source).not.toMatch(/requestSubmit\(|\.submit\(\)/);
  });

  it('the shared password field\'s toggle is a plain button, so Enter never presses it', () => {
    const field = readFileSync(new URL('../shared/PasswordInput.svelte', import.meta.url), 'utf8');
    expect(field).toMatch(/<button\s+type="button"/);
  });

  it.each([
    ['SignInForm', /async function submit[\s\S]{0,120}if \(loading\) return/],
    ['SignUpForm', /async function submit[\s\S]{0,120}if \(loading\) return/],
    ['ForgotPassword', /async function submit[\s\S]{0,120}if \(loading\) return/],
    ['SetPassword', /async function submit[\s\S]{0,120}if \(loading/],
    ['HandoffSignIn', /async function submit[\s\S]{0,120}if \(loading/],
    ['VerifyEmail', /async function choosePassword[\s\S]{0,160}view\.sending\) return/],
    ['RecheckDialog', /async function attempt[\s\S]{0,80}if \(loading\) return/],
    ['PasskeyManager', /async function add\(\)[\s\S]{0,60}if \(busy\) return/],
    ['ProfileForm', /async function save\(\)[\s\S]{0,60}saving\) return/],
  ])('%s: a second press while it works does nothing', (name, guard) => {
    expect(SCREENS.find((s) => s.name === name)!.source).toMatch(guard);
  });
});

describe('every end-user screen is held by the test above', () => {
  it('lists each component that has a text field', () => {
    const held = new Set(SCREENS.map((s) => s.name));
    const dirs = [new URL('./', import.meta.url), new URL('../team/', import.meta.url)];
    const withFields = dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.svelte')).filter((f) => TEXT_FIELD.test(readFileSync(new URL(f, dir), 'utf8'))).map((f) => f.replace('.svelte', '')));
    // Team dialogs for admins are not sign-in screens; the rest must be held.
    const adminOnly = new Set(['InviteDialog', 'MemberList', 'WorkspaceForm', 'EditMemberDialog']);
    expect(withFields.filter((name) => !held.has(name) && !adminOnly.has(name))).toEqual([]);
  });
});
