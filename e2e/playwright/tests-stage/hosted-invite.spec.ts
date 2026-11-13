import { expect, PASSWORD, test, uniqueEmail } from '../support/fixtures';
import { hostedSignIn, stageApp } from '../support/hosted';

// H09, S06 on stage: the team panel invites, the email arrives, the invited person accepts on the hosted page.
test.describe('hosted invite', () => {
	test('an invite sent from the team panel is accepted from the email, and the person lands in the workspace', async ({ page, browser, issuer, person }) => {
		await hostedSignIn(page, person.email, person.password);
		await page.goto('/settings/team');
		const invitee = uniqueEmail('dan');
		await page.getByRole('button', { name: 'Add Member' }).click();
		const dialog = page.locator('[data-bridge-team-dialog][open]');
		await dialog.locator('#bridge-add-emails').fill(invitee);
		await dialog.getByRole('button', { name: 'Send Invite' }).click();
		await expect(dialog).toHaveCount(0);
		await page.locator('.bridge-team-tab', { hasText: 'Invites' }).click();
		await expect(page.locator('[data-bridge-team-invites]')).toContainText(invitee);

		const token = await issuer.lastLink(invitee, 'invite');
		const guest = await browser.newContext();
		const tab = await guest.newPage();
		await tab.goto(`${stageApp().app.hostedSignIn}#bridge=invite&token=${token}`);
		const landing = tab.locator('[data-bridge-invite="sign-up"]');
		await expect(landing).toContainText('Join Acme');
		await landing.locator('#signup-first-name').fill('Dan');
		await landing.locator('#signup-password').fill(PASSWORD);
		await landing.locator('button[type="submit"]').click();
		// The link was not opened from a Child App's sign-in request, so Bridge's page signs the person in itself.
		await expect(tab.locator('[data-sign-in-state="signed-in"]')).toContainText(invitee);
		await guest.close();

		await page.reload();
		await page.locator('.bridge-team-tab', { hasText: 'Members' }).click().catch(() => undefined);
		await expect(page.locator('.bridge-team-table')).toContainText(invitee);
		await page.locator('.bridge-team-tab', { hasText: 'Invites' }).click();
		await expect(page.locator('[data-bridge-team-invites] [data-invite-id]')).toHaveCount(0);
	});
});
