import { expect, PASSWORD, test, uniqueEmail } from '../../support/fixtures';

// A program's request: its S256 challenge, its loopback address and a state.
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const request = (redirect: string) =>
	`/auth/handoff?${new URLSearchParams({ code_challenge: CHALLENGE, code_challenge_method: 'S256', redirect_uri: redirect, state: 'state-12345' })}`;

test.describe('hand-off mode', () => {
	test('signs in for the program and sends the code back to its loopback address', async ({ page, issuer }) => {
		const email = uniqueEmail('dev');
		await issuer.addPerson({ email, password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme' }, { id: 'ws-globex', name: 'Globex' }] });
		let returned: URL | null = null;
		await page.route('http://127.0.0.1:53123/**', async (route) => {
			returned = new URL(route.request().url());
			await route.fulfill({ status: 200, body: 'ok' });
		});

		await page.goto(request('http://127.0.0.1:53123/callback'));
		await expect(page.locator('[data-bridge-handoff="form"] .bridge-auth-heading')).toHaveText('Sign in to the Bridge CLI');
		await page.locator('#handoff-email').fill(email);
		await page.locator('#handoff-password').fill(PASSWORD);
		await page.locator('[data-bridge-handoff="form"] button[type="submit"]').click();
		await page.locator('[data-bridge-handoff="workspace"] [data-workspace-id="ws-globex"]').click();

		await expect.poll(() => returned?.searchParams.get('state')).toBe('state-12345');
		expect(returned!.searchParams.get('code')).toBeTruthy();
		expect(returned!.pathname).toBe('/callback');
	});

	test('refuses a return address that is not a loopback IP', async ({ page }) => {
		await page.goto(request('http://localhost:53123/callback'));
		await expect(page.locator('[data-bridge-handoff="invalid"] [data-bridge-alert]')).toContainText('This sign-in link is not valid.');
		await page.goto(request('https://evil.test/callback'));
		await expect(page.locator('[data-bridge-handoff="invalid"]')).toBeVisible();
	});

	test('never signs this page in', async ({ page, issuer }) => {
		const email = uniqueEmail('dev');
		await issuer.addPerson({ email, password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme' }] });
		await page.route('http://127.0.0.1:53123/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
		await page.goto(request('http://127.0.0.1:53123/callback'));
		await page.locator('#handoff-email').fill(email);
		await page.locator('#handoff-password').fill(PASSWORD);
		await page.locator('[data-bridge-handoff="form"] button[type="submit"]').click();
		await page.waitForURL('http://127.0.0.1:53123/**');
		await page.goto('/');
		await expect(page.getByTestId('home-visitor')).toBeVisible();
	});
});
