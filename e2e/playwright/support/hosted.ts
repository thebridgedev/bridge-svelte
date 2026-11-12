import { expect, type BrowserContext, type Page } from '@playwright/test';
import { readManifest } from './stage/manifest';

/** The run's Child App, from the parity manifest: these specs run only against a real Bridge server. */
export function stageApp() {
	const manifest = readManifest();
	if (manifest === null) throw new Error('These specs need E2E_PARITY_MANIFEST (a real Bridge server).');
	return manifest;
}

/** Whether the page is on the sign-in page Bridge hosts for the app. */
export const onHostedPage = (page: Page) => page.waitForURL((url) => url.href.startsWith(stageApp().app.hostedSignIn));

/** Starts a sign-in at the demo and waits on Bridge's hosted page, at its first step. */
export async function openHostedSignIn(page: Page, path = '/auth/sign-in') {
	await page.goto(path);
	await onHostedPage(page);
	await expect(page.locator('[data-bridge-sign-in-step="credentials"]')).toBeVisible();
}

export async function fillCredentials(page: Page, email: string, password: string) {
	await page.locator('#login-email').fill(email);
	await page.locator('#login-password').fill(password);
	await page.locator('[data-bridge-sign-in-step="credentials"] button[type="submit"]').click();
}

/** Signs in on the hosted page with a password and waits for the demo to show the person signed in. */
export async function hostedSignIn(page: Page, email: string, password: string) {
	await openHostedSignIn(page);
	await fillCredentials(page, email, password);
	await expect(page.getByTestId('sign-out')).toBeVisible();
}

/** A Chromium virtual authenticator, so a passkey can be made and used with no hardware. */
export async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
	const cdp = await context.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
	});
	return {
		/** The passkeys this authenticator holds. */
		credentials: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials,
		/** Gives it passkeys made elsewhere, as the same person's device would hold them. */
		load: async (credentials: Awaited<ReturnType<typeof cdp.send<'WebAuthn.getCredentials'>>>['credentials']) => {
			for (const credential of credentials) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
		},
	};
}

/** Waits until one of the pages shows the address signed in at the demo, and answers that page. */
export async function signedInOn(pages: readonly Page[], email: string): Promise<Page> {
	let found: Page | undefined;
	await expect
		.poll(
			async () => {
				for (const page of pages) {
					const text = await page.getByTestId('home-signed-in').textContent({ timeout: 500 }).catch(() => null);
					if (text?.includes(email)) found = page;
				}
				return found !== undefined;
			},
			{ timeout: 40_000 },
		)
		.toBe(true);
	return found!;
}
