import type { LogoutOptions, LogoutResult } from '@nebulr-group/bridge-auth-core';
import { getBridge } from './client.js';

/**
 * Signs out, for your own sign-out button or code: here, in every tab, and at Bridge, then stays (`{ silent: true }`),
 * goes where you chose (`{ redirectTo }`, only an address of the app's own) or goes to the app's sign-in page
 * (`auth.afterSignOut`). Everything that listens hears `signed-out` in every case.
 */
export function logout(options: LogoutOptions = {}): Promise<LogoutResult> {
	return getBridge().logout(options);
}
