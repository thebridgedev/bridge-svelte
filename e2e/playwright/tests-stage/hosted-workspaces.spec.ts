import { expect, PASSWORD, test, uniqueEmail } from '../support/fixtures';
import { fillCredentials, openHostedSignIn } from '../support/hosted';

// H08 on stage: a person in several workspaces picks one on the hosted page, then switches inside the demo.
test.describe('hosted workspaces', () => {
	test('picks a workspace at sign-in, then switches', async ({ page, issuer }) => {
		const email = uniqueEmail('bob');
		await issuer.addPerson({ email, password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme' }, { id: 'ws-globex', name: 'Globex' }] });
		await openHostedSignIn(page);
		await fillCredentials(page, email, PASSWORD);
		const step = page.locator('[data-bridge-sign-in-step="workspace"]');
		await expect(step.locator('[data-bridge-workspace-name]')).toHaveText(['Acme', 'Globex']);
		await step.locator('[data-bridge-workspace-item]', { hasText: 'Globex' }).click();
		await expect(page.getByTestId('nav-workspace')).toHaveText('Globex');

		await page.getByTestId('nav-workspace').click();
		await expect(page).toHaveURL(/\/auth\/workspaces$/);
		await expect(page.locator(`[data-workspace-id="${issuer.workspaceId('ws-globex')}"]`)).toHaveAttribute('data-active', 'true');
		await page.locator(`[data-workspace-id="${issuer.workspaceId('ws-acme')}"]`).click();
		await expect(page.getByTestId('nav-workspace')).toHaveText('Acme');
	});
});
