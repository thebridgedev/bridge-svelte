/**
 * PlanSelector — catalog rendering (duplicate free buttons + card order).
 *
 * Two defects confirmed on production on 2026-08-12. Both are about how the
 * component turns the plan catalog into cards, so both are driven from a
 * mocked `/account/subscription/plans` payload rather than whatever the local
 * DB happens to hold — the assertions have to be deterministic, and the prod
 * repro (The Bridge's own `free` plan carrying `0 EUR/month` AND `0 EUR/year`)
 * is easy to state as fixture data.
 *
 * BUG A — `pricesForInterval()` short-circuits on `p.amount === 0`, so *every*
 * zero-amount price survives the interval filter. A free plan that defines a
 * zero price for two intervals therefore renders two identical "Select free
 * plan" buttons under every tab. The intent of the `amount === 0` branch was
 * "a free plan stays selectable whichever interval is active" — once, not once
 * per zero price.
 *
 * BUG B — nothing sorts the plans, so cards render in the API's natural order.
 * On prod that is growth → starter → free, which buries the free plan at the
 * bottom of the page.
 *
 * These tests encode the CORRECT behaviour and are expected to FAIL until
 * PlanSelector.svelte is fixed.
 */

import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT, SHORT_TIMEOUT } from '../../fixtures/timeouts';

// ── Fixture catalog ────────────────────────────────────────────────────────

type BillingInterval = 'day' | 'week' | 'month' | 'year';

interface FixturePrice {
  id: string;
  amount: number;
  currency: string;
  recurrenceInterval: BillingInterval;
}

interface FixturePlan {
  key: string;
  name: string;
  description: string;
  trial: boolean;
  trialDays: number;
  hasCost: boolean;
  prices: FixturePrice[];
}

/**
 * The prod repro: the free plan is named "Startup" and carries a zero price
 * for BOTH month and year. Under the current filter that is what produces the
 * duplicate button.
 */
const FREE_PLAN: FixturePlan = {
  key: 'free',
  name: 'Startup',
  description: 'Free forever.',
  trial: false,
  trialDays: 0,
  hasCost: false,
  prices: [
    { id: 'price_free_month', amount: 0, currency: 'eur', recurrenceInterval: 'month' },
    { id: 'price_free_year', amount: 0, currency: 'eur', recurrenceInterval: 'year' },
  ],
};

const STARTER_PLAN: FixturePlan = {
  key: 'starter',
  name: 'Starter',
  description: 'For small teams.',
  trial: false,
  trialDays: 0,
  hasCost: true,
  prices: [
    { id: 'price_starter_month', amount: 10, currency: 'eur', recurrenceInterval: 'month' },
    { id: 'price_starter_year', amount: 100, currency: 'eur', recurrenceInterval: 'year' },
  ],
};

const GROWTH_PLAN: FixturePlan = {
  key: 'growth',
  name: 'Growth',
  description: 'For scaling teams.',
  trial: false,
  trialDays: 0,
  hasCost: true,
  prices: [
    { id: 'price_growth_month', amount: 30, currency: 'eur', recurrenceInterval: 'month' },
    { id: 'price_growth_year', amount: 300, currency: 'eur', recurrenceInterval: 'year' },
  ],
};

/**
 * Deliberately served in the same "wrong" order prod's API returns:
 * growth → starter → free. Cheapest-first would be the exact reverse here,
 * so a component that simply preserved API order cannot pass by luck.
 */
const CATALOG: FixturePlan[] = [GROWTH_PLAN, STARTER_PLAN, FREE_PLAN];

/**
 * Same three plans, but the yearly prices invert the monthly ranking:
 * monthly Starter(10) < Growth(30), yearly Growth(100) < Starter(300).
 * Sorting on the *active* interval's price therefore produces a different
 * card order per tab, which a sort keyed on a fixed interval cannot produce.
 */
const INVERTED_CATALOG: FixturePlan[] = [
  {
    ...GROWTH_PLAN,
    prices: [
      { id: 'price_growth_month', amount: 30, currency: 'eur', recurrenceInterval: 'month' },
      { id: 'price_growth_year', amount: 100, currency: 'eur', recurrenceInterval: 'year' },
    ],
  },
  {
    ...STARTER_PLAN,
    prices: [
      { id: 'price_starter_month', amount: 10, currency: 'eur', recurrenceInterval: 'month' },
      { id: 'price_starter_year', amount: 300, currency: 'eur', recurrenceInterval: 'year' },
    ],
  },
  FREE_PLAN,
];

/**
 * A workspace that has not picked a plan yet — every card stays selectable,
 * so no button is replaced by the disabled "Current plan" label.
 */
const SELECT_PLAN_STATUS = {
  paymentsEnabled: false,
  shouldSelectPlan: true,
  shouldSetupPayments: false,
  paymentFailed: false,
  trial: false,
  trialDaysLeft: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Same label map and display order as PlanSelector's interval tabs. */
const INTERVAL_TAB_LABELS: Record<BillingInterval, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
};

/** Both fixture catalogs offer paid month and year prices, so both tabs render. */
const TABBED_INTERVALS: BillingInterval[] = ['month', 'year'];

/**
 * Serve a fixed plan catalog to the SDK. auth-core hits
 * `${apiBaseUrl}/account/subscription/{status,plans}`; the glob keeps this
 * slot-agnostic (slot 0 → :3200, slot 1 → :3300, …). The explicit CORS header
 * is needed because the demo app and bridge-api sit on different origins.
 */
async function mockPlanCatalog(page: Page, plans: FixturePlan[]): Promise<void> {
  await page.route('**/account/subscription/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(SELECT_PLAN_STATUS),
    }),
  );

  await page.route('**/account/subscription/plans', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(plans),
    }),
  );
}

/** Navigate to the demo's /subscription page and wait for the cards to settle. */
async function openPlanSelector(page: Page): Promise<Locator> {
  await page.goto('/subscription');
  await page.waitForLoadState('networkidle');

  const selector = page.locator('[data-bridge-plan-selector]');
  await expect(selector).toBeVisible({ timeout: MED_TIMEOUT });
  await expect(selector).toHaveAttribute('data-loading', 'false', { timeout: LONG_TIMEOUT });
  await expect(page.locator('[data-bridge-plan-card]').first()).toBeVisible({
    timeout: MED_TIMEOUT,
  });

  return selector;
}

/** Click an interval tab and wait for it to become the active one. */
async function selectInterval(page: Page, interval: BillingInterval): Promise<void> {
  const label = INTERVAL_TAB_LABELS[interval];
  const tab = page
    .locator('[data-bridge-plan-interval-tabs]')
    .getByRole('button', { name: label, exact: true });

  await expect(
    tab,
    `the fixture catalog offers paid ${label.toLowerCase()} prices, so a "${label}" interval tab must be rendered`,
  ).toBeVisible({ timeout: SHORT_TIMEOUT });

  await tab.click();

  await expect(
    tab,
    `clicking the "${label}" tab must make it the active interval`,
  ).toHaveAttribute('data-active', 'true', { timeout: SHORT_TIMEOUT });
}

/** The card for a plan, matched on its rendered name heading. */
function planCard(page: Page, planName: string): Locator {
  return page
    .locator('[data-bridge-plan-card]')
    .filter({ has: page.getByRole('heading', { name: planName, exact: true }) });
}

/** Rendered plan names, in DOM order. */
async function renderedPlanOrder(page: Page): Promise<string[]> {
  const names = await page.locator('[data-bridge-plan-cards] [data-bridge-plan-card] h3').allTextContents();
  return names.map((name) => name.trim());
}

/** The single button label PlanSelector should show for a plan at an interval. */
function expectedButtonLabel(plan: FixturePlan, interval: BillingInterval): string {
  const freePrice = plan.prices.find((p) => p.amount === 0);
  if (freePrice) return 'Select free plan';

  const price = plan.prices.find((p) => p.recurrenceInterval === interval);
  if (!price) {
    throw new Error(
      `Fixture error: plan "${plan.name}" has no price at interval "${interval}" — ` +
        `this suite's fixtures are meant to price every plan at every tabbed interval.`,
    );
  }
  return `${price.amount} ${price.currency.toUpperCase()} / ${price.recurrenceInterval}`;
}

/** Plan names sorted cheapest-first on the given interval; ties broken by name. */
function cheapestFirst(plans: FixturePlan[], interval: BillingInterval): string[] {
  const amountAt = (plan: FixturePlan): number => {
    const free = plan.prices.find((p) => p.amount === 0);
    if (free) return 0;
    const price = plan.prices.find((p) => p.recurrenceInterval === interval);
    if (!price) {
      throw new Error(
        `Fixture error: plan "${plan.name}" has no price at interval "${interval}".`,
      );
    }
    return price.amount;
  };

  return [...plans]
    .sort((a, b) => amountAt(a) - amountAt(b) || a.name.localeCompare(b.name))
    .map((plan) => plan.name);
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('PlanSelector catalog rendering', () => {
  // Regression: a free plan priced 0 for two intervals rendered a duplicate
  // "Select free plan" button, because pricesForInterval() short-circuits the
  // interval check on `p.amount === 0` (2026-08-12)
  test('renders exactly one select button per plan card per interval tab', async ({
    authenticatedPage: page,
  }) => {
    await mockPlanCatalog(page, CATALOG);
    await openPlanSelector(page);

    for (const interval of TABBED_INTERVALS) {
      await selectInterval(page, interval);

      for (const plan of CATALOG) {
        const card = planCard(page, plan.name);
        const buttons = card.getByRole('button');

        await expect(
          buttons,
          `plan "${plan.name}" prices [${plan.prices
            .map((p) => `${p.amount} ${p.currency}/${p.recurrenceInterval}`)
            .join(', ')}] — under the "${INTERVAL_TAB_LABELS[interval]}" tab its card must offer ` +
            `exactly ONE select button, not one per matching price`,
        ).toHaveCount(1);

        await expect(
          buttons,
          `plan "${plan.name}" under the "${INTERVAL_TAB_LABELS[interval]}" tab should offer ` +
            `"${expectedButtonLabel(plan, interval)}"`,
        ).toHaveText(expectedButtonLabel(plan, interval));

        // The zero-price branch exists so a free plan stays pickable whichever
        // interval is active — collapsing the duplicate must not turn the free
        // card into "Not available monthly/yearly".
        await expect(
          card.locator('[data-bridge-plan-unavailable]'),
          `plan "${plan.name}" must stay selectable under the "${INTERVAL_TAB_LABELS[interval]}" tab`,
        ).toHaveCount(0);
      }
    }
  });

  // Regression: plan cards rendered in the API's natural order (growth →
  // starter → free on prod), burying the free plan last (2026-08-12)
  test('orders plan cards cheapest-first for the active interval', async ({
    authenticatedPage: page,
  }) => {
    await mockPlanCatalog(page, CATALOG);
    await openPlanSelector(page);

    for (const interval of TABBED_INTERVALS) {
      await selectInterval(page, interval);

      const expectedOrder = cheapestFirst(CATALOG, interval);
      expect(
        await renderedPlanOrder(page),
        `under the "${INTERVAL_TAB_LABELS[interval]}" tab, plan cards must render cheapest-first ` +
          `(${expectedOrder.join(' → ')}). The API deliberately returns them as ` +
          `[${CATALOG.map((p) => p.name).join(', ')}], so unsorted output keeps the free plan last.`,
      ).toEqual(expectedOrder);
    }
  });

  // Regression: same root cause as the test above — this one pins the sort KEY
  // to the active interval's price rather than a fixed one (2026-08-12)
  test('re-orders plan cards when the active interval changes the ranking', async ({
    authenticatedPage: page,
  }) => {
    await mockPlanCatalog(page, INVERTED_CATALOG);
    await openPlanSelector(page);

    for (const interval of TABBED_INTERVALS) {
      await selectInterval(page, interval);

      const expectedOrder = cheapestFirst(INVERTED_CATALOG, interval);
      expect(
        await renderedPlanOrder(page),
        `this catalog prices Starter cheaper monthly (10 vs 30 EUR) but dearer yearly ` +
          `(300 vs 100 EUR), so the "${INTERVAL_TAB_LABELS[interval]}" tab must order the cards ` +
          `${expectedOrder.join(' → ')} — the ranking follows the ACTIVE interval's price.`,
      ).toEqual(expectedOrder);
    }
  });
});
