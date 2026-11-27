import type { BrowserContext, Page } from '@playwright/test';
import { expect, PASSWORD, signIn, test, uniqueEmail } from '../../support/fixtures';
import type { Person, TestIssuer } from '../../support/issuer';

/**
 * Passkeys in Chromium, WebKit (Safari) and Firefox (TBP-59). Chromium drives the whole ceremony with its virtual
 * authenticator; WebKit and Firefox have none headless, so there the browser's answer is played (a closed dialog) and
 * everything around the ceremony is checked: the button, the click that starts setup, the "No passkey was used" note,
 * and the plain "This browser cannot use passkeys." where a browser has no passkeys at all.
 */

/** A browser with no passkeys at all: no WebAuthn. */
async function withoutPasskeys(page: Page) {
	await page.addInitScript(() => {
		delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
	});
}

/**
 * A browser whose passkey dialog the person closes: what Safari and Firefox answer when nobody picks a passkey. The
 * page's own code is untouched; only the browser's answer is played. Counts the dialogs opened, for "only on a click".
 */
async function closedDialogs(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { PublicKeyCredential?: unknown; __dialogs: number };
		w.__dialogs = 0;
		if (typeof w.PublicKeyCredential !== 'function') w.PublicKeyCredential = function PublicKeyCredential() {};
		const pkc = w.PublicKeyCredential as unknown as Record<string, unknown>;
		// No autofill list here: the button is the way in, as on a browser without conditional mediation.
		pkc['isConditionalMediationAvailable'] = () => Promise.resolve(false);
		pkc['isUserVerifyingPlatformAuthenticatorAvailable'] = () => Promise.resolve(true);
		const closed = () => {
			w.__dialogs += 1;
			return Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
		};
		Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: closed, create: closed, store: closed, preventSilentAccess: () => Promise.resolve() } });
	});
}

const dialogs = (page: Page) => page.evaluate(() => (window as unknown as { __dialogs: number }).__dialogs);

async function virtualAuthenticator(context: BrowserContext, page: Page) {
	const cdp = await context.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
	});
	return {
		credentials: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials,
		load: async (credentials: Awaited<ReturnType<typeof cdp.send<'WebAuthn.getCredentials'>>>['credentials']) => {
			for (const credential of credentials) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
		},
	};
}

/** The app offers passkeys, and Anna has an account with a password. */
async function passkeyApp(issuer: TestIssuer): Promise<Person> {
	test.skip(issuer.offerPasskeys === undefined, 'passkeys are switched on per app on a real server');
	await issuer.offerPasskeys?.();
	const anna: Person = { email: uniqueEmail('anna'), password: PASSWORD, firstName: 'Anna', workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] };
	await issuer.addPerson(anna);
	return anna;
}

/** Asks for a passkey setup link from the sign-in page, as a person who has none would, and answers its token. */
async function requestSetupLink(page: Page, issuer: TestIssuer, email: string): Promise<string> {
	await page.goto('/auth/sign-in');
	await page.locator('#login-email').fill(email);
	await page.locator('[data-bridge-passkey-setup-link]').click();
	await expect(page.getByText('a link to set up a passkey is on its way')).toBeVisible();
	return issuer.lastLink(email, 'passkey-setup');
}

test.describe('passkeys in every browser (TBP-59)', () => {
	test('a browser without passkeys: no passkey button, no error before anything is typed, and the password signs in as before', async ({ page, issuer }) => {
		const anna = await passkeyApp(issuer);
		await withoutPasskeys(page);
		await page.goto('/auth/sign-in');
		await expect(page.locator('#login-password')).toBeVisible();
		await expect(page.locator('[data-bridge-passkey-sign-in]')).toHaveCount(0);
		await expect(page.locator('[data-bridge-passkey-setup-link]')).toHaveCount(0);
		// Nothing has gone wrong yet, so nothing says it has.
		await expect(page.getByRole('alert')).toHaveCount(0);
		await signIn(page, anna.email);
	});

	test('a browser without passkeys opening a setup link is told plainly, and the link is not spent', async ({ page, browser, issuer }) => {
		const anna = await passkeyApp(issuer);
		await closedDialogs(page);
		const token = await requestSetupLink(page, issuer, anna.email);
		const other = await browser.newContext();
		const tab = await other.newPage();
		await withoutPasskeys(tab);
		await tab.goto(`/auth#bridge=passkey-setup&token=${token}`);
		await expect(tab.locator('[data-bridge-passkey-setup="unsupported"]')).toContainText('This browser cannot use passkeys.');
		await expect(tab.locator('[data-bridge-passkey-create]')).toHaveCount(0);
		await other.close();
	});

	test('the passkey button is offered next to the password, and closing the dialog returns to the form with a short note and the setup link', async ({ page, issuer }) => {
		await passkeyApp(issuer);
		await closedDialogs(page);
		await page.goto('/auth/sign-in');
		const button = page.locator('[data-bridge-passkey-sign-in]');
		await expect(button).toHaveText('Sign in with a passkey');
		await expect(page.locator('#login-email')).toHaveAttribute('autocomplete', 'username webauthn');
		await button.click();
		await expect(page.getByText('No passkey was used. Try again, or sign in another way.')).toBeVisible();
		// No dead end: the password, the button and the setup link are all still there.
		await expect(page.locator('#login-password')).toBeVisible();
		await expect(button).toBeEnabled();
		await expect(page.locator('[data-bridge-passkey-setup-link]')).toBeVisible();
		expect(await dialogs(page)).toBe(1);
	});

	test('setting up a passkey from the emailed link waits for the click, and a closed dialog leaves the link to try again', async ({ page, issuer }) => {
		const anna = await passkeyApp(issuer);
		await closedDialogs(page);
		const token = await requestSetupLink(page, issuer, anna.email);
		const asked: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/passkeys/setup')) asked.push(request.url());
		});
		await page.goto(`/auth#bridge=passkey-setup&token=${token}`);
		const create = page.locator('[data-bridge-passkey-create]');
		await expect(create).toBeVisible();
		await page.waitForTimeout(500);
		// Nothing starts on its own: no dialog, no ceremony asked of Bridge, until the person clicks.
		expect(await dialogs(page)).toBe(0);
		expect(asked).toEqual([]);
		await create.click();
		await expect(page.getByText('No passkey was used. Try again, or sign in another way.')).toBeVisible();
		expect(await dialogs(page)).toBe(1);
		await expect(page.locator('[data-bridge-passkey-create]')).toBeVisible();
	});

	test('Chromium: a passkey set up from the link signs in on a clean browser, from the email field list or the button', async ({ page, context, browser, browserName, issuer }) => {
		test.skip(browserName !== 'chromium', 'only Chromium has a virtual authenticator');
		const anna = await passkeyApp(issuer);
		const device = await virtualAuthenticator(context, page);
		const token = await requestSetupLink(page, issuer, anna.email);
		await page.goto(`/auth#bridge=passkey-setup&token=${token}`);
		await page.locator('[data-bridge-passkey-create]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(anna.email);
		const credentials = await device.credentials();
		expect(credentials).toHaveLength(1);

		// A clean browser holding the same passkey: no session, only the passkey.
		const clean = await browser.newContext();
		const tab = await clean.newPage();
		await (await virtualAuthenticator(clean, tab)).load(credentials);
		await tab.goto('/auth/sign-in');
		await Promise.race([
			tab.locator('[data-bridge-passkey-sign-in]').click({ timeout: 25_000 }).catch(() => undefined),
			tab.getByTestId('home-signed-in').waitFor({ timeout: 25_000 }).catch(() => undefined),
		]);
		await expect(tab.getByTestId('home-signed-in')).toContainText(anna.email);
		await clean.close();
	});
});
