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
		// RFC 9207: the program learns which issuer answered.
		expect(returned!.searchParams.get('iss')).toBe(issuer.issuer);
	});

	for (const [name, query] of [
		['localhost', request('http://localhost:53123/callback')],
		['https to evil.test', request('https://evil.test/callback')],
		['https loopback', request('https://127.0.0.1:53123/callback')],
		['a host that starts with 127.0.0.1', request('http://127.0.0.1.evil.com:53123/callback')],
		['userinfo before another host', request('http://127.0.0.1@evil.com/callback')],
		['no port', request('http://127.0.0.1/callback')],
		['a fragment', request('http://127.0.0.1:53123/callback#x')],
		['another path', request('http://127.0.0.1:53123/other')],
		['a plain challenge', request('http://127.0.0.1:53123/callback').replace('code_challenge_method=S256', 'code_challenge_method=plain')],
		['redirect_uri twice', `${request('http://127.0.0.1:53123/callback')}&redirect_uri=${encodeURIComponent('https://evil.test/callback')}`],
	] as const) {
		test(`refuses ${name}, and signs nobody in`, async ({ page }) => {
			const signIns: string[] = [];
			page.on('request', (r) => {
				if (r.url().includes('/sign-in') && r.method() === 'POST') signIns.push(r.url());
			});
			await page.goto(query);
			await expect(page.locator('[data-bridge-handoff="invalid"] [data-bridge-alert]')).toContainText('This sign-in link is not valid.');
			await expect(page.locator('#handoff-email')).toHaveCount(0);
			expect(new URL(page.url()).pathname).toBe('/auth/handoff');
			expect(signIns).toEqual([]);
		});
	}

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
