import { expect, signIn, test } from '../../support/fixtures';

const style = (page: import('@playwright/test').Page, selector: string, prop: string) =>
	page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe('customisation', () => {
	test('rung 1: the app’s --bridge-* tokens restyle the forms', async ({ page }) => {
		await page.goto('/auth/sign-in');
		const button = '[data-bridge-sign-in-step="credentials"] .bridge-btn-primary';
		await expect(page.locator(button)).toBeVisible();
		// The demo sets --bridge-primary to its teal accent and a 10px radius.
		expect(await style(page, button, 'background-color')).toBe('rgb(15, 118, 110)');
		expect(await style(page, '#login-email', 'border-top-left-radius')).toBe('10px');
	});

	test('rung 2: a frame and per-page headings around every auth page', async ({ page }) => {
		await page.goto('/framed/sign-in');
		await expect(page.getByTestId('frame')).toHaveAttribute('data-page', 'sign-in');
		await expect(page.getByTestId('frame-heading')).toHaveText('Back to your desk');
		await expect(page.locator('#login-email')).toBeVisible();
		await page.goto('/framed/forgot-password');
		await expect(page.getByTestId('frame')).toHaveAttribute('data-page', 'forgot-password');
	});

	test('rung 3: the app’s own page with Bridge’s form inside', async ({ page, person }) => {
		await page.goto('/custom/sign-in');
		await expect(page.getByTestId('custom-sign-in').getByRole('heading', { level: 1 })).toHaveText('Welcome back to Helpdesk');
		await expect(page.locator('.bridge-auth-heading')).toHaveCount(0);
		await signIn(page, person.email, person.password, '/custom/sign-in');
		await expect(page.getByTestId('home-signed-in')).toBeVisible();
	});

	test('rung 4: headless, on the client alone', async ({ page, person }) => {
		await page.goto('/headless');
		await page.locator('[data-testid="headless-form"] input[name="email"]').fill(person.email);
		await page.locator('[data-testid="headless-form"] input[name="password"]').fill('wrong');
		await page.locator('[data-testid="headless-form"] button').click();
		await expect(page.getByTestId('headless-error')).toHaveText('Invalid email or password.');
		await page.locator('[data-testid="headless-form"] input[name="password"]').fill(person.password);
		await page.locator('[data-testid="headless-form"] button').click();
		await expect(page.getByTestId('headless-done')).toContainText(person.email);
	});
});
