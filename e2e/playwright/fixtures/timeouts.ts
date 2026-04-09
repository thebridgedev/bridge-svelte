/**
 * Timeout constants for Playwright E2E tests.
 *
 * Use these instead of hardcoded timeout values throughout tests.
 */

/** Long timeout for operations like login flows, page loads with redirects (30 seconds) */
export const LONG_TIMEOUT = 30_000;

/** Medium timeout for network requests, animations, transitions (10 seconds) */
export const MED_TIMEOUT = 10_000;

/** Short timeout for quick UI updates, element visibility checks (5 seconds) */
export const SHORT_TIMEOUT = 5_000;
