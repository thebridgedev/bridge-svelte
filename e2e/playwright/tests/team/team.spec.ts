import { expect, PASSWORD, signIn, test, uniqueEmail } from '../../support/fixtures';

test.describe('team panel', () => {
	test('lists the members, and a team manager invites and revokes', async ({ page, issuer, person }) => {
		const colleague = uniqueEmail('carol');
		await issuer.addPerson({ email: colleague, password: PASSWORD, firstName: 'Carol', workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'MEMBER' }] });
		await signIn(page, person.email);
		await page.goto('/settings/team');
		const table = page.locator('.bridge-team-table');
		await expect(table).toContainText(person.email);
		await expect(table).toContainText(colleague);

		const invitee = uniqueEmail('dan');
		await page.getByRole('button', { name: 'Add Member' }).click();
		const dialog = page.locator('[data-bridge-team-dialog][open]');
		await dialog.locator('#bridge-add-emails').fill(invitee);
		await dialog.getByRole('button', { name: 'Send Invite' }).click();
		await expect(dialog).toHaveCount(0);

		await page.locator('.bridge-team-tab', { hasText: 'Invites' }).click();
		const invites = page.locator('[data-bridge-team-invites]');
		await expect(invites).toContainText(invitee);
		await invites.getByRole('button', { name: 'Revoke' }).first().click();
		await expect(invites).toContainText(`Invite to ${invitee} revoked.`);
		await expect(invites.locator('[data-invite-id]')).toHaveCount(0);
	});

	test('sending again stops the old link; a revoked link says so', async ({ page, browser, issuer, person }) => {
		test.skip(issuer.kind === 'real', 'Reading an invite link needs the issuer\'s test seams.');
		await signIn(page, person.email);
		await page.goto('/settings/team');
		const invitee = uniqueEmail('eve');
		await page.getByRole('button', { name: 'Add Member' }).click();
		const dialog = page.locator('[data-bridge-team-dialog][open]');
		await dialog.locator('#bridge-add-emails').fill(invitee);
		await dialog.getByRole('button', { name: 'Send Invite' }).click();
		await expect(dialog).toHaveCount(0);
		const first = await issuer.lastLink(invitee, 'invite');

		await page.locator('.bridge-team-tab', { hasText: 'Invites' }).click();
		const invites = page.locator('[data-bridge-team-invites]');
		await invites.getByRole('button', { name: 'Resend' }).first().click();
		await expect(invites).toContainText(`Invite sent again to ${invitee}.`);
		const second = await issuer.lastLink(invitee, 'invite');
		expect(second).not.toBe(first);

		const visitor = await browser.newContext();
		const tab = await visitor.newPage();
		await tab.goto(`/auth#bridge=invite&token=${first}`);
		await expect(tab.locator('[data-bridge-invite="closed"]')).toHaveAttribute('data-invite-state', 'expired');
		await tab.goto(`/auth#bridge=invite&token=${second}`);
		await expect(tab.locator('[data-bridge-invite="sign-up"]')).toContainText('Join Acme');

		await invites.getByRole('button', { name: 'Revoke' }).first().click();
		await expect(invites).toContainText(`Invite to ${invitee} revoked.`);
		await tab.goto('/');
		await tab.goto(`/auth#bridge=invite&token=${second}`);
		await expect(tab.locator('[data-bridge-invite="closed"]')).toHaveAttribute('data-invite-state', 'revoked');
		await expect(tab.locator('[data-bridge-alert]')).toHaveText('This invite was revoked. Ask the person who invited you for a new one.');
		await visitor.close();
	});

	test('without the team flag, the panel only shows', async ({ page, issuer, person }) => {
		await issuer.setFlags({ 'bridge-team-manage': false });
		await signIn(page, person.email);
		await page.goto('/settings/team');
		await expect(page.locator('.bridge-team-table')).toContainText(person.email);
		await expect(page.getByRole('button', { name: 'Add Member' })).toHaveCount(0);
		await expect(page.locator('[data-bridge-team-actions]')).toHaveCount(0);
	});

	test('the profile tab saves the person’s name', async ({ page, person }) => {
		await signIn(page, person.email);
		await page.goto('/settings/team');
		await page.locator('.bridge-team-tab', { hasText: 'Profile' }).click();
		const profile = page.locator('[data-bridge-team-profile]');
		await profile.locator('#bridge-profile-first-name').fill('Alicia');
		await profile.getByRole('button', { name: /save/i }).click();
		await expect(page.getByTestId('nav-user')).toContainText('Alicia');
	});
});
