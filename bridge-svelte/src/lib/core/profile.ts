/**
 * My profile: what `<MyProfile>` reads and saves, kept apart from the markup
 * so it can be tested against auth-core's fake issuer.
 *
 * Details are the person's names, the app's own fields and their own
 * language, saved with `me.update`. The email address changes through
 * Identity and Access (`bridge.emailChange`): a recent sign-in, then the
 * current inbox, then the new one. An address that Google or a company's
 * sign-in manages is read-only.
 */
import { USER_LANGUAGES, type Me, type MeUpdate, type MyLogin, type ProfileField, type UserLanguage } from '@nebulr-group/bridge-auth-core';
import { getBridge } from './client.js';
import { withRecheck } from './recheck.js';

export { providerName } from './providers.js';

/** The screen languages a person can choose, each named in its own language. */
export const PROFILE_LANGUAGES: readonly { readonly code: UserLanguage; readonly name: string }[] = [
	{ code: 'da', name: 'Dansk' },
	{ code: 'de', name: 'Deutsch' },
	{ code: 'en', name: 'English' },
	{ code: 'es', name: 'Español' },
	{ code: 'fr', name: 'Français' },
	{ code: 'it', name: 'Italiano' },
	{ code: 'nl', name: 'Nederlands' },
	{ code: 'nb', name: 'Norsk bokmål' },
	{ code: 'pl', name: 'Polski' },
	{ code: 'pt', name: 'Português' },
	{ code: 'fi', name: 'Suomi' },
	{ code: 'sv', name: 'Svenska' },
];

/** Whether `value` is one of the screen languages. */
export function isProfileLanguage(value: unknown): value is UserLanguage {
	return typeof value === 'string' && (USER_LANGUAGES as readonly string[]).includes(value);
}

/** What the Details form holds. */
export interface DetailsForm {
	readonly firstName: string;
	readonly lastName: string;
	readonly phoneNumber: string;
	/** '' for none chosen. */
	readonly language: string;
	/** The app's own fields, by label. */
	readonly fields: Readonly<Record<string, string>>;
}

/** The form filled from the profile. */
export function formOf(me: Pick<Me, 'firstName' | 'lastName' | 'phoneNumber' | 'language' | 'customFields'>): DetailsForm {
	return {
		firstName: me.firstName ?? '',
		lastName: me.lastName ?? '',
		phoneNumber: me.phoneNumber ?? '',
		language: me.language ?? '',
		fields: Object.fromEntries((me.customFields ?? []).map((field) => [field.label, field.value ?? ''])),
	};
}

/** What shows of the app's own fields: the editable ones as inputs, the others read-only. */
export function shownFields(me: Pick<Me, 'customFields'>): readonly ProfileField[] {
	return me.customFields ?? [];
}

/**
 * Only what changed, for `me.update`. Names and the phone number only when the
 * form shows them; a read-only field never.
 */
export function detailsChange(
	me: Pick<Me, 'firstName' | 'lastName' | 'phoneNumber' | 'language' | 'customFields'>,
	form: DetailsForm,
	shown: { readonly names: boolean; readonly phone: boolean },
): MeUpdate {
	const base = formOf(me);
	const change: { -readonly [K in keyof MeUpdate]: MeUpdate[K] } = {};
	if (shown.names && form.firstName.trim() !== base.firstName) change.firstName = form.firstName.trim();
	if (shown.names && form.lastName.trim() !== base.lastName) change.lastName = form.lastName.trim();
	if (shown.phone && form.phoneNumber.trim() !== base.phoneNumber) change.phoneNumber = form.phoneNumber.trim();
	if (form.language !== base.language) change.language = isProfileLanguage(form.language) ? form.language : null;
	// A number field's input gives a number, not text (Svelte's bind:value on type="number"): read every value as text.
	const given = (label: string) => String(form.fields[label] ?? '').trim();
	const fields = (me.customFields ?? [])
		.filter((field) => field.editable !== false)
		.filter((field) => given(field.label) !== (base.fields[field.label] ?? ''))
		.map((field) => ({ label: field.label, value: given(field.label) }));
	if (fields.length > 0) change.customFields = fields;
	return change;
}

/** Saves the details; a route that wants a recent sign-in asks the person to confirm it is them first. */
export function saveDetails(change: MeUpdate): Promise<Omit<Me, 'workspaces'>> {
	return withRecheck(() => getBridge().me.update(change));
}

/** The person's login: their address, who manages it and a change waiting. */
export function loadLogin(): Promise<MyLogin> {
	return getBridge().emailChange.status();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why a new address cannot be asked for, before asking Bridge: `invalid`, `same`, or null when it can. */
export function newEmailProblem(current: string, given: string): 'invalid' | 'same' | null {
	const next = given.trim();
	if (!EMAIL.test(next)) return 'invalid';
	return next.toLowerCase() === current.toLowerCase() ? 'same' : null;
}

/**
 * Asks to change the address. When the sign-in is too old Bridge says so, the
 * "confirm it is you" dialog opens (password or passkey, plus the second step
 * Bridge asks for), and the change is asked again once. Resolves with the
 * login as it is now, the change waiting for the current inbox.
 */
export async function startEmailChange(email: string): Promise<MyLogin> {
	await withRecheck(() => getBridge().emailChange.start(email));
	return loadLogin();
}

/** Cancels the change waiting. */
export async function cancelEmailChange(): Promise<MyLogin> {
	await getBridge().emailChange.cancel();
	return loadLogin();
}
