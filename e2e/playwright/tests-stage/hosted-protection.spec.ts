import { expect, test } from '../support/fixtures';
import { fillCredentials, openHostedSignIn } from '../support/hosted';

// H07 on stage: repeated wrong passwords pause sign-in, and the page says so. One throwaway person: this locks them.
test.describe('hosted sign-in protection', () => {
	test('too many wrong passwords show the wait message', async ({ page, person }) => {
		const alert = page.locator('[data-bridge-alert][data-variant="error"]');
		await openHostedSignIn(page);
		let message = '';
		for (let attempt = 1; attempt <= 15 && !/too many|wait|locked/i.test(message); attempt++) {
			await fillCredentials(page, person.email, `wrong password ${attempt}`);
			await expect(alert).toBeVisible();
			message = (await alert.textContent()) ?? '';
		}
		expect(message).toMatch(/too many attempts/i);
		expect(message).toMatch(/\d+ minute|wait/i);
	});
});
