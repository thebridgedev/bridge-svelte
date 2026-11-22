/**
 * The logic of the phone number field: which country to start on, how a typed number becomes a full international
 * number, whether it can exist, and the country list with its search. No component and no network in here.
 *
 * The country to start on comes only from the browser's language and region settings, which need no permission. The
 * person's location is never asked for and never looked up: with no region in the settings, no country is chosen.
 */
import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

export type Country = CountryCode;

export interface CountryRow {
	readonly code: Country;
	/** The name in the screen's language. */
	readonly name: string;
	/** The English name, matched by the search too. */
	readonly englishName: string;
	/** The calling code, without the plus: `44`. */
	readonly dial: string;
}

const COUNTRIES: ReadonlySet<string> = new Set(getCountries());

/** The country a language tag names by its region (`en-GB` is `GB`, `sv-SE` is `SE`); null when it names none (`en`). */
export function countryOfLanguage(tag: string | null | undefined): Country | null {
	if (typeof tag !== 'string') return null;
	const parts = tag.replace(/_/g, '-').split('-').slice(1);
	// A region is two letters (`GB`) and comes after the language, and after a four-letter script such as `Hant`.
	const region = parts.find((part) => /^[A-Za-z]{2}$/.test(part))?.toUpperCase();
	return region !== undefined && COUNTRIES.has(region) ? (region as Country) : null;
}

/** The first country the browser's language list names, or null. `languages` is `navigator.languages`. */
export function guessCountry(languages: readonly string[] | null | undefined): Country | null {
	for (const tag of languages ?? []) {
		const country = countryOfLanguage(tag);
		if (country !== null) return country;
	}
	return null;
}

/** The browser's own language list, read in the browser only. */
export function browserLanguages(): readonly string[] {
	if (typeof navigator === 'undefined') return [];
	return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

/** Every country the numbering knows, named in `locale`, sorted by that name. */
export function countryRows(locale: string | undefined): CountryRow[] {
	let local: Intl.DisplayNames | null = null;
	let english: Intl.DisplayNames | null = null;
	try {
		english = new Intl.DisplayNames(['en'], { type: 'region' });
		local = new Intl.DisplayNames([locale ?? 'en'], { type: 'region' });
	} catch {
		// A runtime without region names lists the codes.
	}
	const rows = getCountries().map((code) => ({
		code,
		name: local?.of(code) ?? code,
		englishName: english?.of(code) ?? code,
		dial: String(getCountryCallingCode(code)),
	}));
	return rows.sort((a, b) => a.name.localeCompare(b.name, locale ?? 'en'));
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * The countries a search matches: by name in the screen's language, by English name, by letters of the country code
 * (`se`), or by calling code with or without the plus (`+44`, `44`).
 */
export function filterCountries(rows: readonly CountryRow[], query: string): CountryRow[] {
	const q = fold(query);
	if (q === '') return [...rows];
	const digits = q.replace(/^\+/, '').replace(/\s+/g, '');
	const isDial = /^\d+$/.test(digits);
	return rows.filter((row) => fold(row.name).includes(q) || fold(row.englishName).includes(q) || row.code.toLowerCase() === q || (isDial && row.dial.startsWith(digits)));
}

export interface PhoneReading {
	/** The full international number (`+46701234567`) when the text makes one; otherwise the text as typed, trimmed. */
	readonly value: string;
	/** The country the number belongs to: the one chosen, or the one a pasted `+` number names. */
	readonly country: Country | null;
	/** Whether the number can exist for that country. False for nothing typed? No: an empty field is fine, see `empty`. */
	readonly possible: boolean;
	readonly empty: boolean;
}

/**
 * Reads what was typed for the chosen country. A number is typed the way people are used to, with or without a leading
 * 0; a number that starts with `+` names its own country, and switches the flag.
 */
export function readPhone(text: string, country: Country | null): PhoneReading {
	const typed = text.trim();
	if (typed === '') return { value: '', country, possible: true, empty: true };
	const parsed = typed.startsWith('+') ? parsePhoneNumberFromString(typed) : country === null ? undefined : parsePhoneNumberFromString(typed, country);
	if (parsed === undefined) return { value: typed, country, possible: false, empty: false };
	// A `+` number may belong to a shared calling code: keep the chosen country when it uses that code.
	const named = parsed.country ?? null;
	const keep = country !== null && String(getCountryCallingCode(country)) === parsed.countryCallingCode ? country : named;
	return { value: parsed.number, country: keep ?? country, possible: parsed.isPossible(), empty: false };
}

/** The text of a number as the person reads it in their own country: national format, for a stored full number. */
export function displayPhone(value: string, country: Country | null): { readonly text: string; readonly country: Country | null } {
	const stored = value.trim();
	if (stored === '') return { text: '', country };
	const parsed = stored.startsWith('+') ? parsePhoneNumberFromString(stored) : country === null ? undefined : parsePhoneNumberFromString(stored, country);
	if (parsed === undefined) return { text: stored, country };
	const found = parsed.country ?? country;
	return { text: found !== null && found !== undefined ? parsed.formatNational() : parsed.formatInternational(), country: found ?? null };
}

/** Formats as the person types, for the chosen country. */
export function typing(text: string, country: Country | null): string {
	if (text.trim() === '') return '';
	return new AsYouType(country ?? undefined).input(text);
}
