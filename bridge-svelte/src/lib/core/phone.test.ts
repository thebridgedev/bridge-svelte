import { describe, expect, it } from 'vitest';
import { countryOfLanguage, countryRows, displayPhone, filterCountries, guessCountry, readPhone } from './phone.js';

describe('the country to start on comes only from the browser\'s language and region', () => {
  it('reads the region of a language tag', () => {
    expect(countryOfLanguage('en-GB')).toBe('GB');
    expect(countryOfLanguage('sv-SE')).toBe('SE');
    expect(countryOfLanguage('zh-Hant-TW')).toBe('TW');
    expect(countryOfLanguage('pt_BR')).toBe('BR');
  });
  it('guesses nothing from a language with no region, and never asks for a location', () => {
    expect(countryOfLanguage('en')).toBeNull();
    expect(countryOfLanguage('xx-ZZ')).toBeNull();
    expect(guessCountry(['en', 'sv'])).toBeNull();
    expect(guessCountry([])).toBeNull();
    expect(guessCountry(undefined)).toBeNull();
  });
  it('takes the first language that names a region', () => {
    expect(guessCountry(['en', 'de-AT', 'fr-FR'])).toBe('AT');
  });
});

describe('the country list and its search', () => {
  const rows = countryRows('en');
  it('lists every country with its calling code, sorted by name', () => {
    expect(rows.length).toBeGreaterThan(200);
    expect(rows.find((row) => row.code === 'SE')).toMatchObject({ englishName: 'Sweden', dial: '46' });
    expect(rows.map((row) => row.name)).toEqual([...rows.map((row) => row.name)].sort((a, b) => a.localeCompare(b, 'en')));
  });
  it('matches the name, the English name, the code letters and the calling code', () => {
    expect(filterCountries(rows, 'swed').map((row) => row.code)).toContain('SE');
    expect(filterCountries(rows, '+44').map((row) => row.code)).toContain('GB');
    expect(filterCountries(rows, '44').map((row) => row.code)).toContain('GB');
    expect(filterCountries(rows, 'se').map((row) => row.code)).toContain('SE');
    expect(filterCountries(rows, '  ').length).toBe(rows.length);
    expect(filterCountries(rows, 'zzzz')).toEqual([]);
  });
  it('matches the name in the screen\'s language and the English one, ignoring accents', () => {
    const sv = countryRows('sv');
    expect(sv.find((row) => row.code === 'DE')!.name).toBe('Tyskland');
    expect(filterCountries(sv, 'tyskl').map((row) => row.code)).toContain('DE');
    expect(filterCountries(sv, 'germany').map((row) => row.code)).toContain('DE');
    expect(filterCountries(rows, 'cote').map((row) => row.code)).toContain('CI');
  });
});

describe('a typed number becomes the full international number', () => {
  it('takes a number with or without the leading 0', () => {
    expect(readPhone('070 123 45 67', 'SE')).toMatchObject({ value: '+46701234567', country: 'SE', possible: true });
    expect(readPhone('70 123 45 67', 'SE')).toMatchObject({ value: '+46701234567', possible: true });
    expect(readPhone('020 7946 0958', 'GB')).toMatchObject({ value: '+442079460958', possible: true });
  });
  it('switches the country when a number starting with + is pasted', () => {
    expect(readPhone('+44 20 7946 0958', 'SE')).toMatchObject({ value: '+442079460958', country: 'GB', possible: true });
    expect(readPhone('+46701234567', null)).toMatchObject({ country: 'SE' });
  });
  it('catches a number that cannot exist for the chosen country, before anything is sent', () => {
    expect(readPhone('123', 'SE')).toMatchObject({ possible: false, empty: false });
    expect(readPhone('070 123 45 67 89 11', 'SE').possible).toBe(false);
    expect(readPhone('070 123 45 67', null).possible).toBe(false);
  });
  it('an empty field is fine', () => {
    expect(readPhone('  ', 'SE')).toMatchObject({ value: '', empty: true, possible: true });
  });
  it('shows a stored full number the way the person reads it', () => {
    expect(displayPhone('+46701234567', null)).toEqual({ text: '070-123 45 67', country: 'SE' });
    expect(displayPhone('', 'SE')).toEqual({ text: '', country: 'SE' });
    expect(displayPhone('0701234567', 'SE').country).toBe('SE');
  });
});
