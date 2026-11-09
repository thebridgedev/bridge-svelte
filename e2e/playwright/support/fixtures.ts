import { test as base, expect, type Page } from '@playwright/test';
import { testIssuer, type Person, type TestIssuer } from './issuer';

export const PASSWORD = 'correct horse battery';

let counter = 0;
/** An address no other test uses. */
export function uniqueEmail(name = 'person'): string {
	counter += 1;
	return `${name}-${Date.now().toString(36)}-${counter}@demo.test`;
}

/**
 * Signs in through a sign-in page. By default it waits until the person is
 * signed in; pass `wait: false` when the next step is the workspace choice or
 * an error.
 */
export async function signIn(page: Page, email: string, password = PASSWORD, path = '/auth/sign-in', options: { wait?: boolean } = {}) {
	await page.goto(path);
	await page.locator('#login-email').fill(email);
	await page.locator('#login-password').fill(password);
	await page.locator('[data-bridge-sign-in-step="credentials"] button[type="submit"]').click();
	if (options.wait !== false) await expect(page.getByTestId('sign-out')).toBeVisible();
}

type Fixtures = {
	issuer: TestIssuer;
	/** A person in one workspace, already on the issuer. */
	person: Person;
};

export const test = base.extend<Fixtures>({
	issuer: async ({}, use) => {
		const issuer = testIssuer();
		await issuer.reset();
		await use(issuer);
	},
	person: async ({ issuer }, use) => {
		const person: Person = { email: uniqueEmail('alice'), password: PASSWORD, firstName: 'Alice', workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] };
		await issuer.addPerson(person);
		await use(person);
	},
});

export { expect };

/** Records every request URL the page makes, to prove a secret never travels in one. */
export function recordRequests(page: Page): string[] {
	const urls: string[] = [];
	page.on('request', (request) => urls.push(request.url()));
	return urls;
}

/**
 * Proves an email link's token left the address bar and the history, and
 * never went into a request URL.
 */
export async function expectTokenGone(page: Page, token: string, requests: readonly string[]) {
	expect(page.url()).not.toContain(token);
	expect(await page.evaluate(() => window.location.href)).not.toContain(token);
	expect(requests.filter((url) => url.includes(token))).toEqual([]);
	const here = page.url();
	await page.goBack();
	expect(page.url(), 'the entry before the link page').not.toContain(token);
	await page.goForward();
	expect(page.url(), 'the link page in history').toBe(here);
}
