import { expect, PASSWORD, signIn, test, uniqueEmail } from '../../support/fixtures';

test.describe('workspaces', () => {
	test('a person in several workspaces picks one at sign-in, then switches', async ({ page, issuer }) => {
		const email = uniqueEmail('bob');
		await issuer.addPerson({ email, password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme' }, { id: 'ws-globex', name: 'Globex' }] });
		await signIn(page, email, PASSWORD, undefined, { wait: false });

		const step = page.locator('[data-bridge-sign-in-step="workspace"]');
		await expect(step.locator('[data-bridge-workspace-name]')).toHaveText(['Acme', 'Globex']);
		await step.locator('[data-workspace-id="ws-globex"]').click();
		await expect(page.getByTestId('nav-workspace')).toHaveText('Globex');

		await page.getByTestId('nav-workspace').click();
		await expect(page).toHaveURL(/\/auth\/workspaces$/);
		await expect(page.locator('[data-workspace-id="ws-globex"]')).toHaveAttribute('data-active', 'true');
		await page.locator('[data-workspace-id="ws-acme"]').click();
		await expect(page.getByTestId('nav-workspace')).toHaveText('Acme');
		await expect(page).toHaveURL(/\/$/);
	});
});
