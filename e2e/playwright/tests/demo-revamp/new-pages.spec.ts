/**
 * Demo Revamp — New Pages Tests
 *
 * The TBP demo makeover added a set of feature-validation pages, each built on
 * the shared FeaturePage template (which pulls doc text from /learning and pairs
 * it with a live SDK component). These tests verify that those new pages render
 * their doc-pulled copy AND their live components for an authenticated user.
 *
 * All of these routes are `protected` (defaultAccess = 'protected'), so they use
 * the `authenticatedPage` fixture (SDK-logged-in page).
 *
 * Selectors prefer the stable test ids the app exposes (rollout-key, rollout-in/out,
 * entitlement-key, entitlement-result, persona-select, theme-toggle, inspector-toggle),
 * falling back to the SDK components' own stable data-attributes / role+text.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Demo revamp — new feature pages', () => {
  test('/rollout renders the percentage-rollout doc copy + live flag', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/rollout');
    await page.waitForLoadState('domcontentloaded');

    // doc-pulled one-liner text
    await expect(page.getByText('sticky buckets', { exact: false }).first()).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    // live control: the rollout flag key input
    await expect(page.getByTestId('rollout-key')).toBeVisible();

    // exactly one of the in/out branches should resolve
    const inBranch = page.getByTestId('rollout-in');
    const outBranch = page.getByTestId('rollout-out');
    await expect(inBranch.or(outBranch).first()).toBeVisible({ timeout: MED_TIMEOUT });

    const isIn = await inBranch.isVisible().catch(() => false);
    const isOut = await outBranch.isVisible().catch(() => false);
    expect(isIn !== isOut).toBeTruthy();
  });

  test('/paywall renders the entitlement check + subscription status', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/paywall');
    await page.waitForLoadState('domcontentloaded');

    // entitlement probe input + live readout
    await expect(page.getByTestId('entitlement-key')).toBeVisible({ timeout: MED_TIMEOUT });
    const result = page.getByTestId('entitlement-result');
    await expect(result).toBeVisible();
    // the readout carries a boolean data-on attribute (true/false)
    await expect(result).toHaveAttribute('data-on', /true|false/);

    // BridgeSubscriptionStatus content — it renders exactly one of
    // loading / error / plan / empty states.
    const subStatus = page
      .locator('.bss-plan, .bss-empty, .bss-loading, .bss-error')
      .first();
    await expect(subStatus).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('/api-tokens renders the ApiTokenManagement component', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/api-tokens');
    await page.waitForLoadState('domcontentloaded');

    // ApiTokenManagement renders its own header (.bridge-api-title, an <h2>
    // reading "API Tokens"). Target the component's own class to disambiguate
    // from the FeaturePage <h1> ("API tokens").
    await expect(page.locator('.bridge-api-title')).toBeVisible({ timeout: MED_TIMEOUT });

    // It exposes a create control (primary button) — confirm a token-management
    // action is present.
    await expect(page.locator('.bridge-btn-primary').first()).toBeVisible();
  });

  test('/branding renders the live preview or empty-state note', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/branding');
    await page.waitForLoadState('domcontentloaded');

    // The live preview label always renders.
    await expect(page.getByText('Live preview', { exact: false }).first()).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    // Either the live preview region or the empty-state note renders depending
    // on whether a branding snapshot has arrived.
    const preview = page.locator('.br-preview');
    const empty = page.locator('.br-empty');
    await expect(preview.or(empty).first()).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('/workspaces renders the WorkspaceSelector', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/workspaces');
    await page.waitForLoadState('domcontentloaded');

    // WorkspaceSelector roots carry a stable data-attribute (the page renders
    // two instances — default + custom-row renderer).
    await expect(
      page.locator('[data-bridge-workspace-selector]').first(),
    ).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('topbar exposes persona, theme and inspector controls on an authenticated page', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('persona-select')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('inspector-toggle')).toBeVisible();
  });
});
