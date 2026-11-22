import { describe, expect, it } from 'vitest';
import { carryEmail, takeCarriedEmail } from './carry.js';

const files = import.meta.glob('../components/auth/*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const source = (path: string) => files[path] as string;

describe('the email carried from sign-in to Forgot password', () => {
  it('is handed over once, trimmed, and then gone', () => {
    carryEmail('  anna@acme.test ');
    expect(takeCarriedEmail()).toBe('anna@acme.test');
    expect(takeCarriedEmail()).toBe('');
  });

  it('is empty when nothing was typed, or when Forgot password is opened directly', () => {
    carryEmail('   ');
    expect(takeCarriedEmail()).toBe('');
    expect(takeCarriedEmail()).toBe('');
  });

  it('the newest email wins', () => {
    carryEmail('first@acme.test');
    carryEmail('second@acme.test');
    expect(takeCarriedEmail()).toBe('second@acme.test');
  });

  it('is wired: the sign-in link carries it, Forgot password takes it, and no address has an email in it', () => {
    const signIn = source('../components/auth/SignInForm.svelte');
    const forgot = source('../components/auth/ForgotPassword.svelte');
    expect(signIn).toMatch(/onclick=\{\(\) => carryEmail\(email\)\}/);
    expect(signIn).not.toMatch(/forgot-password[^`'"]*[?&]email/);
    expect(forgot).toMatch(/let email = \$state\(takeCarriedEmail\(\)\)/);
    expect(forgot).not.toMatch(/searchParams|location\.search|page\.url/);
  });
});
