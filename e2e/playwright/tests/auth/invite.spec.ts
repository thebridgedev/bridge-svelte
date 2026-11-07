import { expect, expectTokenGone, recordRequests, test } from '../../support/fixtures';

test('an invite link says invites are not offered yet, until the issuer offers them', async ({ page, issuer }) => {
	test.skip(issuer.kind === 'real', 'A real issuer may offer invites: that path is tested against it.');
	const token = 'inv-secret-0123456789';
	const requests = recordRequests(page);
	await page.goto(`/auth#bridge=invite&token=${token}`);
	await expect(page).toHaveURL(/\/auth\/invite$/);
	await expect(page.locator('[data-bridge-invite="not-offered"] [data-bridge-alert]')).toContainText('Invites cannot be accepted here yet.');
	await expectTokenGone(page, token, requests);
});
