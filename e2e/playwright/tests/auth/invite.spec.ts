import { expect, expectTokenGone, PASSWORD, recordRequests, signIn, test, uniqueEmail } from '../../support/fixtures';

const ACME = { id: 'ws-acme', name: 'Acme' };
const INITECH = { id: 'ws-initech', name: 'Initech' };

test.describe('invite landing', () => {
	test.skip(({ issuer }) => issuer.kind === 'real', 'Sending an invite and reading its link needs the issuer\'s test seams.');

	test('a new person signs up from the invite and lands signed in, in the workspace, with no email to verify', async ({ page, issuer }) => {
		const email = uniqueEmail('nina');
		const token = await issuer.invite(email, ACME);
		const requests = recordRequests(page);
		// Bridge's invite email lands on the app's email-links address with the token in the fragment.
		await page.goto(`/auth#bridge=invite&token=${token}`);
		await expect(page).toHaveURL(/\/auth\/invite$/);
		const landing = page.locator('[data-bridge-invite="sign-up"]');
		await expect(landing).toContainText('Join Acme');
		await expect(landing.locator('#signup-email')).toHaveCount(0);
		await landing.locator('#signup-first-name').fill('Nina');
		await landing.locator('#signup-password').fill(PASSWORD);
		await landing.locator('button[type="submit"]').click();
		await expect(page.getByTestId('home-signed-in')).toHaveText(`Signed in as ${email}, in Acme.`);
		await expectTokenGone(page, token, requests);
	});

	test('a person with an account signs in, and the invite is accepted on the way', async ({ page, issuer }) => {
		const email = uniqueEmail('omar');
		await issuer.addPerson({ email, password: PASSWORD, workspaces: [INITECH] });
		const token = await issuer.invite(email, ACME);
		await page.goto(`/auth#bridge=invite&token=${token}`);
		const landing = page.locator('[data-bridge-invite="sign-in"]');
		await expect(landing).toContainText('Join Acme');
		await landing.locator('#login-email').fill(email);
		await landing.locator('#login-password').fill(PASSWORD);
		await landing.locator('[data-bridge-sign-in-step="credentials"] button[type="submit"]').click();
		// Two workspaces now: the sign-in asks which, then the invite moves the session into Acme.
		const chooser = page.locator('[data-bridge-sign-in-step="workspace"]');
		if (await chooser.isVisible().catch(() => false)) await chooser.getByRole('button', { name: /Initech/ }).click();
		await expect(page.getByTestId('home-signed-in')).toHaveText(`Signed in as ${email}, in Acme.`);
	});

	test('someone signed in already accepts with one button', async ({ page, issuer, person }) => {
		await signIn(page, person.email);
		const token = await issuer.invite(person.email, INITECH, 'MEMBER');
		await page.goto(`/auth#bridge=invite&token=${token}`);
		const landing = page.locator('[data-bridge-invite="accept"]');
		await expect(landing).toContainText('Join Initech');
		await expect(landing.locator('[data-bridge-invite-as]')).toHaveText(`Signed in as ${person.email}.`);
		await landing.getByRole('button', { name: 'Accept invite' }).click();
		await expect(page.getByTestId('home-signed-in')).toHaveText(`Signed in as ${person.email}, in Initech.`);
	});

	test('an invite for another address says so, and offers to sign out', async ({ page, issuer, person }) => {
		const other = uniqueEmail('pia');
		await issuer.addPerson({ email: other, password: PASSWORD, workspaces: [INITECH] });
		await signIn(page, person.email);
		const token = await issuer.invite(other, INITECH);
		await page.goto(`/auth#bridge=invite&token=${token}`);
		const landing = page.locator('[data-bridge-invite="accept"]');
		await landing.getByRole('button', { name: 'Accept invite' }).click();
		await expect(landing).toHaveAttribute('data-invite-error', 'invite_for_another_address');
		await expect(landing.locator('[data-bridge-alert]')).toHaveText('This invite is for another email address. Sign out, then sign in with the address it was sent to.');
		await landing.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.locator('[data-bridge-invite="sign-in"]')).toBeVisible();
	});

	test('a member already is told so, and goes on', async ({ page, issuer, person }) => {
		await signIn(page, person.email);
		const token = await issuer.invite(person.email, ACME);
		await page.goto(`/auth#bridge=invite&token=${token}`);
		const landing = page.locator('[data-bridge-invite="accept"]');
		await landing.getByRole('button', { name: 'Accept invite' }).click();
		await expect(landing.locator('[data-bridge-alert]')).toHaveText('You are a member of this workspace already.');
		await landing.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
	});

	test('an expired, a used and a made-up link each say why, and nothing else', async ({ page, browser, issuer }) => {
		const late = uniqueEmail('quinn');
		const expired = await issuer.invite(late, ACME);
		await issuer.expireInvites(late);
		await page.goto(`/auth#bridge=invite&token=${expired}`);
		await expect(page.locator('[data-bridge-invite="closed"]')).toHaveAttribute('data-invite-state', 'expired');
		await expect(page.locator('[data-bridge-alert]')).toHaveText('This invite has expired. Ask the person who invited you for a new one.');
		await expect(page.locator('[data-bridge-invite="closed"]')).not.toContainText('Acme');

		const email = uniqueEmail('rosa');
		const used = await issuer.invite(email, ACME);
		const first = await browser.newContext();
		const tab = await first.newPage();
		await tab.goto(`/auth#bridge=invite&token=${used}`);
		await tab.locator('#signup-password').fill(PASSWORD);
		await tab.locator('[data-bridge-invite="sign-up"] button[type="submit"]').click();
		await expect(tab.getByTestId('home-signed-in')).toContainText(email);
		await first.close();
		await page.goto(`/auth#bridge=invite&token=${used}`);
		await expect(page.locator('[data-bridge-invite="closed"]')).toHaveAttribute('data-invite-state', 'used');
		await expect(page.locator('[data-bridge-alert]')).toHaveText('This invite was used already. Sign in to open the workspace.');

		await page.goto('/auth#bridge=invite&token=ws-acme_made-up-0123456789');
		await expect(page.locator('[data-bridge-invite="closed"]')).toHaveAttribute('data-invite-state', 'expired');
	});

	test('the invite page without a link says where the link is', async ({ page }) => {
		await page.goto('/auth/invite');
		await expect(page.locator('[data-bridge-alert]')).toHaveText('Open this page from the link in your email.');
	});
});
