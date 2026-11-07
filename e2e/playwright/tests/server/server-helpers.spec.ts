import { expect, signIn, test } from '../../support/fixtures';

test.describe('server helpers', () => {
	test('the app’s API refuses a call with no token', async ({ request }) => {
		const response = await request.post('/api/tickets');
		expect(response.status()).toBe(401);
	});

	test('a signed-in call is checked on the server and counted', async ({ page, issuer, person }) => {
		// The local issuer's tokens are not signed, so only a real issuer can prove the server check.
		test.skip(issuer.kind === 'local', 'Needs a real issuer (E2E_ISSUER): the local issuer does not sign tokens.');
		await signIn(page, person.email);
		await page.goto('/tickets');
		await page.getByTestId('new-ticket').click();
		await expect(page.getByTestId('ticket-result')).toHaveText('Ticket created.');
	});
});
