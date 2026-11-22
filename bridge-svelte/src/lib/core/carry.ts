/**
 * What one sign-in screen hands to the next, in memory, within the app's own screens.
 *
 * The email typed on the sign-in screen is carried to Forgot password so the person does not type it again. It is
 * never put in the web address: addresses end up in browser history, server logs and analytics. It is kept here only
 * from the moment the person goes to Forgot password until that screen takes it, once; opening Forgot password
 * directly, or reloading it, shows an empty field.
 */
let carried: string | null = null;

/** Keeps the email for the screen the person goes to next. An empty value clears it. */
export function carryEmail(email: string): void {
	const trimmed = email.trim();
	carried = trimmed === '' ? null : trimmed;
}

/** The carried email, once: the next call gets nothing. */
export function takeCarriedEmail(): string {
	const email = carried ?? '';
	carried = null;
	return email;
}
