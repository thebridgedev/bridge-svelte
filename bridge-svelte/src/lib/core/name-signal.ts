/**
 * After the person changed their own name: their password manager shows the new name with their passkeys (the
 * WebAuthn Signal API, where the browser has it). The name is their email, the display name their full name, as
 * Bridge made the passkeys with. Never fails the save.
 */
export interface NameSignaller {
	readonly passkeys: { signalCurrentUser(name: string, displayName: string): Promise<void> };
}

export async function signalNewName(bridge: NameSignaller, profile: { readonly email: string; readonly firstName: string | null; readonly lastName: string | null }, nameChanged: boolean): Promise<void> {
	if (!nameChanged || profile.email === "") return;
	const displayName = [profile.firstName, profile.lastName].filter((part) => part !== null && part.trim() !== "").join(" ") || profile.email;
	try {
		await bridge.passkeys.signalCurrentUser(profile.email, displayName);
	} catch {
		// A courtesy to the browser: the profile is saved either way.
	}
}
