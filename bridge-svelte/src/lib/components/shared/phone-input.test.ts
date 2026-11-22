import { describe, expect, it } from 'vitest';

const files = import.meta.glob(['./PhoneInput.svelte', '../team/ProfileForm.svelte'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const picker = files['./PhoneInput.svelte'] as string;
const profile = files['../team/ProfileForm.svelte'] as string;

describe('the phone number field\'s picker', () => {
  it('shows flags as images, so they show on every system, and loads them only when used', () => {
    expect(picker).toMatch(/<img class="bridge-phone-flag"/);
    expect(picker).toMatch(/import\('country-flag-icons\/string\/3x2'\)/);
    // No flag emoji (regional indicator letters) anywhere in the component.
    expect(picker).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  });

  it('never asks for or looks up a location', () => {
    expect(picker).not.toMatch(/geolocation|fetch\(|XMLHttpRequest|ipapi|ip-api/i);
    const logic = (import.meta.glob('../../core/phone.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['../../core/phone.ts'] as string;
    expect(logic).not.toMatch(/geolocation|fetch\(|XMLHttpRequest/i);
  });

  it('Enter in the search box chooses a country and never submits the form around the field', () => {
    expect(picker).toMatch(/function onSearchKey[\s\S]*?event\.key === 'Enter'[\s\S]*?event\.preventDefault\(\)[\s\S]*?choose\(/);
    // Every button in the picker is a plain button, so it never becomes the form's submit button.
    for (const button of picker.match(/<button\b[^>]*>/g) ?? []) expect(button).toMatch(/type="button"/);
  });

  it('searches by name, English name and code, and a number that cannot exist is flagged', () => {
    expect(picker).toMatch(/filterCountries\(rows, query\)/);
    expect(picker).toMatch(/readPhone\(text, country\)/);
    expect(picker).toMatch(/invalid = !reading\.empty && !reading\.possible/);
  });

  it('is the profile form\'s phone field, and the form stops before saving a number that cannot exist', () => {
    expect(profile).toMatch(/<PhoneInput id="bridge-profile-phone" bind:value=\{phoneNumber\} bind:invalid=\{phoneInvalid\}/);
    expect(profile).toMatch(/if \(phoneInvalid\) \{\s*error = t\('phone\.invalid'\);\s*return;/);
    expect(profile).not.toMatch(/type="tel"/);
  });
});
