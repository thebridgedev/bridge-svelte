import type { LogoutOptions, LogoutResult } from '@nebulr-group/bridge-auth-core';
import { getBridge } from './client.js';

/**
 * Signs out, for your own sign-out button or code: here, in every tab, and at Bridge, then stays (`{ silent: true }`),
 * goes where you chose (`{ redirectTo }`, only this page's address or one of the app's addresses as Bridge lists them)
 * or goes to the default: the sign-out page the app's settings on Bridge name, else the app's sign-in page
 * (`auth.afterSignOut`). Nothing to configure in the app. Everything that listens hears `signed-out` in every case.
 */
export function logout(options: LogoutOptions = {}): Promise<LogoutResult> {
	return getBridge().logout(options);
}
