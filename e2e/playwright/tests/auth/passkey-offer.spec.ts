import type { BrowserContext, Page } from '@playwright/test';
import { expect, PASSWORD, signIn, test, uniqueEmail } from '../../support/fixtures';
import type { Person, TestIssuer } from '../../support/issuer';

/**
 * Offering a passkey at the right moment (TBP-536), in Chromium, WebKit and Firefox: after a password sign-in and after a
 * password reset, with Not now and Don't ask again kept for the person. Chromium makes the passkey with its virtual
 * authenticator; WebKit and Firefox have none headless, so there the browser's answer (a closed dialog) is played.
 */

async function closedDialogs(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { PublicKeyCredential?: unknown };
		if (typeof w.PublicKeyCredential !== 'function') w.PublicKeyCredential = function PublicKeyCredential() {};
		const pkc = w.PublicKeyCredential as unknown as Record<string, unknown>;
		pkc['isConditionalMediationAvailable'] = () => Promise.resolve(false);
		pkc['getClientCapabilities'] = () => Promise.resolve({ conditionalCreate: false });
		const closed = () => Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
		Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: closed, create: closed, store: closed, preventSilentAccess: () => Promise.resolve() } });
	});
}

async function virtualAuthenticator(context: BrowserContext, page: Page) {
	const cdp = await context.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
	});
	return { credentials: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials };
}

async function passkeyApp(issuer: TestIssuer): Promise<Person> {
	test.skip(issuer.offerPasskeys === undefined, 'passkeys are switched on per app on a real server');
	await issuer.offerPasskeys?.();
	const ben: Person = { email: uniqueEmail('ben'), password: PASSWORD, firstName: 'Ben', workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] };
	await issuer.addPerson(ben);
	return ben;
}

/** Signs in with the password and waits for the offer, which comes before the app. */
async function signInToOffer(page: Page, email: string) {
	await signIn(page, email, PASSWORD, '/auth/sign-in', { wait: false });
	await expect(page.locator('[data-bridge-passkey-offer="offer"]')).toContainText('Sign in faster with a passkey');
}

test.describe('the passkey offer (TBP-536)', () => {
	test('after a password sign-in: "Not now" goes on into the app and is kept, so the next sign-in goes straight in', async ({ page, issuer }) => {
		const ben = await passkeyApp(issuer);
		await closedDialogs(page);
		await signInToOffer(page, ben.email);
		await expect(page.locator('[data-bridge-passkey-offer="offer"]')).toContainText('Use your fingerprint, face or screen lock instead of a password.');
		await page.locator('[data-bridge-passkey-offer-later]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(ben.email);
		await page.getByTestId('sign-out').click();
		await expect(page.getByTestId('sign-out')).toHaveCount(0);
		await signIn(page, ben.email);
		await expect(page.locator('[data-bridge-passkey-offer]')).toHaveCount(0);
	});

	test('"Don\'t ask again" is kept for the person: another browser is not asked either', async ({ page, browser, issuer }) => {
		const ben = await passkeyApp(issuer);
		await closedDialogs(page);
		await signInToOffer(page, ben.email);
		await page.locator('[data-bridge-passkey-offer-never]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(ben.email);
		const other = await browser.newContext();
		const tab = await other.newPage();
		await closedDialogs(tab);
		await signIn(tab, ben.email);
		await expect(tab.locator('[data-bridge-passkey-offer]')).toHaveCount(0);
		await other.close();
	});

	test('a dialog closed on Create never blocks the sign-in: a short note, then into the app', async ({ page, issuer }) => {
		const ben = await passkeyApp(issuer);
		await closedDialogs(page);
		await signInToOffer(page, ben.email);
		await page.locator('[data-bridge-passkey-offer-create]').click();
		await expect(page.locator('[data-bridge-passkey-offer="failed"]')).toContainText('No passkey was made.');
		await page.locator('[data-bridge-passkey-offer-continue]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(ben.email);
	});

	test('a browser without passkeys is never offered one', async ({ page, issuer }) => {
		const ben = await passkeyApp(issuer);
		await page.addInitScript(() => {
			delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
		});
		await signIn(page, ben.email);
		await expect(page.locator('[data-bridge-passkey-offer]')).toHaveCount(0);
	});

	test('after a password reset: "Also add a passkey?", without signing in and without a second email', async ({ page, context, browserName, issuer }) => {
		const ben = await passkeyApp(issuer);
		const device = browserName === 'chromium' ? await virtualAuthenticator(context, page) : null;
		if (device === null) await closedDialogs(page);
		await page.goto('/auth/forgot-password');
		await page.locator('#forgot-email').fill(ben.email);
		await page.locator('[data-bridge-forgot-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-forgot-password="sent"]')).toBeVisible();
		const token = await issuer.lastLink(ben.email, 'reset-password');
		await page.goto(`/auth#bridge=reset-password&token=${token}`);
		await page.locator('#set-password').fill('a brand new passphrase');
		await page.locator('#set-password-confirm').fill('a brand new passphrase');
		await page.locator('[data-bridge-set-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-set-password="passkey-offer"]')).toContainText('Also add a passkey?');
		await page.locator('[data-bridge-passkey-offer-create]').click();
		const done = page.locator('[data-bridge-set-password="done"]');
		if (device !== null) {
			await expect(done).toContainText('Passkey created.');
			expect(await device.credentials()).toHaveLength(1);
		} else {
			await expect(done).toContainText('No passkey was made.');
		}
		// Nobody is signed in by the reset: the way on is the sign-in page.
		await expect(done.getByRole('link', { name: 'Sign in' })).toBeVisible();
	});

	test('Chromium: Create makes the passkey on the spot, and it then signs in on its own', async ({ page, context, browserName, issuer }) => {
		test.skip(browserName !== 'chromium', 'only Chromium has a virtual authenticator');
		const ben = await passkeyApp(issuer);
		const device = await virtualAuthenticator(context, page);
		await signIn(page, ben.email, PASSWORD, '/auth/sign-in', { wait: false });
		// The browser may make it on its own first (automatic creation); otherwise the offer asks.
		const offer = page.locator('[data-bridge-passkey-offer="offer"], [data-bridge-passkey-offer="saved"]');
		await expect(offer).toBeVisible();
		if ((await offer.getAttribute('data-bridge-passkey-offer')) === 'offer') await page.locator('[data-bridge-passkey-offer-create]').click();
		await expect(page.locator('[data-bridge-passkey-offer="made"], [data-bridge-passkey-offer="saved"]')).toContainText('Next time, sign in with your fingerprint, face or screen lock.');
		await page.locator('[data-bridge-passkey-offer-continue]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(ben.email);
		expect(await device.credentials()).toHaveLength(1);
		// Signed out, the sign-in page's autofill offers the passkey, and the virtual device picks it at once.
		await page.getByTestId('sign-out').click();
		await page.goto('/auth/sign-in');
		await Promise.race([
			page.locator('[data-bridge-passkey-sign-in]').click({ timeout: 25_000 }).catch(() => undefined),
			page.getByTestId('home-signed-in').waitFor({ timeout: 25_000 }).catch(() => undefined),
		]);
		await expect(page.getByTestId('home-signed-in')).toContainText(ben.email);
		await expect(page.locator('[data-bridge-passkey-offer]')).toHaveCount(0);
	});
});
