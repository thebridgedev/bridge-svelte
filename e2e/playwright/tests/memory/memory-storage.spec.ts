import type { Page } from '@playwright/test';
import { expect, PASSWORD, signIn, test, uniqueEmail } from '../../support/fixtures';

/**
 * The demo with `storage: 'memory'`: nothing of Bridge's in the browser's
 * storage, a reload signs in again, and a sign-up's email link, which opens
 * in a new tab, finishes in the tab that started it.
 *
 * SvelteKit itself keeps scroll positions in sessionStorage (`sveltekit:*`);
 * those hold nothing of Bridge's and are left out of the check.
 */
async function storageOf(page: Page): Promise<Record<string, string>> {
	return page.evaluate(() => {
		const all: Record<string, string> = {};
		for (const store of [localStorage, sessionStorage]) {
			for (let i = 0; i < store.length; i += 1) {
				const key = store.key(i) as string;
				if (!key.startsWith('sveltekit:')) all[key] = store.getItem(key) ?? '';
			}
		}
		return all;
	});
}

test.describe('storage: memory', () => {
	test('a signed-in page keeps nothing in localStorage or sessionStorage, and a reload signs in again', async ({ page, person }) => {
		await signIn(page, person.email);
		expect(await storageOf(page)).toEqual({});
		expect(await page.evaluate(() => document.cookie)).toBe('');
		await page.reload();
		await expect(page.getByTestId('nav-sign-in')).toBeVisible();
		expect(await storageOf(page)).toEqual({});
	});

	test('a sign-up link opened in a new tab finishes in the tab that started the sign-up', async ({ page, context, issuer }) => {
		const email = uniqueEmail('sam');
		await page.goto('/auth/sign-up');
		await page.locator('#signup-email').fill(email);
		await page.locator('#signup-password').fill(PASSWORD);
		await page.locator('[data-bridge-sign-up-step="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-sign-up-sent]')).toContainText(email);
		const token = await issuer.lastLink(email, 'verify-sign-up');

		const linkTab = await context.newPage();
		await linkTab.goto(`/auth#bridge=verify-email&token=${token}`);
		await expect(linkTab.locator('[data-bridge-verify-email="continued"] [data-bridge-alert]')).toHaveText(
			'Your sign-up goes on in the window where you started it. You can close this one.',
		);
		expect(linkTab.url()).not.toContain(token);
		await expect(page.getByTestId('home-signed-in')).toContainText(email);
		expect(await storageOf(page)).toEqual({});
	});

	test('with the starting tab gone, the link says to open it on the device that started it', async ({ browser, issuer }) => {
		const email = uniqueEmail('tess');
		const first = await browser.newContext();
		const start = await first.newPage();
		await start.goto('/auth/sign-up');
		await start.locator('#signup-email').fill(email);
		await start.locator('#signup-password').fill(PASSWORD);
		await start.locator('[data-bridge-sign-up-step="form"] button[type="submit"]').click();
		await expect(start.locator('[data-bridge-sign-up-sent]')).toContainText(email);
		const token = await issuer.lastLink(email, 'verify-sign-up');
		await first.close();

		const second = await browser.newContext();
		const tab = await second.newPage();
		await tab.goto(`/auth#bridge=verify-email&token=${token}`);
		await expect(tab.locator('[data-bridge-verify-email="failed"]')).toHaveAttribute('data-error-kind', 'wrong-device');
		await second.close();
	});

	test('an invite signs a new person up and in with nothing in storage', async ({ page, issuer }) => {
		const email = uniqueEmail('uma');
		const token = await issuer.invite(email, { id: 'ws-acme', name: 'Acme' });
		await page.goto(`/auth#bridge=invite&token=${token}`);
		await page.locator('#signup-password').fill(PASSWORD);
		await page.locator('[data-bridge-invite="sign-up"] button[type="submit"]').click();
		await expect(page.getByTestId('home-signed-in')).toHaveText(`Signed in as ${email}, in Acme.`);
		expect(await storageOf(page)).toEqual({});
	});
});
