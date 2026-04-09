# Playwright E2E for Bridge Plugins — Spec & Implementation Guide

This document defines the **specification** and **step-by-step instructions** for adding Playwright end-to-end tests to Bridge plugins (e.g. bridge-svelte, bridge-react, bridge-angular). Use it when creating or porting E2E tests so all plugins follow the same approach.

---

## 1. Specification

### 1.1 Goals

- Run E2E tests against a **demo app** that integrates the Bridge plugin (auth, feature flags, route guards, team, etc.).
- Use the **Bridge API test data API** to create a test app and test accounts — no manual app registration or app ID in repo.
- Support **multiple backends**: local (same host), stage, and production, with a single demo app URL and per-environment config.
- Tests run **outside containers** by default: demo app starts on the host (e.g. port 3001); callback URL and base URL must match.

### 1.2 Architecture

| Component | Purpose |
|-----------|--------|
| **Pre-setup** | Runs before Playwright. Calls `POST /account/test/playwright/setup-test-app` (domain, appName, ownerEmail, `appUrl`). Writes `VITE_BRIDGE_APP_ID` (or framework equivalent) into the demo app env file (e.g. `demo/.env.test.local`) so the demo starts with the correct app ID. |
| **Global setup** | Runs once per test run. Loads env, optionally calls test data API (health, purge accounts), exports `BRIDGE_TEST_APP_ID` (and optionally owner email) for fixtures. Does not create the app (pre-setup does that). |
| **TestDataClient** | Wraps Bridge API test endpoints: health, create test account, remove test account, setup test app, purge. Uses env for base URL and API key. |
| **Environment config** | Single module (e.g. `environments.ts`) that returns `baseUrl`, `authBaseUrl`, `cloudViewsUrl`, `testDataApiUrl`, `testDataApiKey`, `appId`, `appDomain` per environment (local / stage / prod). Demo `baseUrl` must match the port the demo actually runs on (e.g. `http://localhost:3001`). |
| **Fixtures** | **auth**: `testDataClient`, `envConfig`, `testUser` (created via TestDataClient, cleaned up after), `authenticatedPage` (page with login already performed), `loginViaBridgeAuth(page, email, password, envConfig)`. **clean-page**: fresh browser context with no auth. **timeouts**: `LONG_TIMEOUT`, `MED_TIMEOUT`, `SHORT_TIMEOUT` constants. |
| **Playwright config** | One `playwright.config.ts` at repo root. Projects: local, local-no-auth, stage, prod. Single `webServer` that starts the demo (e.g. `cd demo && npm run dev -- --mode test.local`). `baseURL` = demo URL (e.g. `http://localhost:3001`). `globalSetup` points to the global-setup file. |

### 1.3 Callback URL and App Creation

- The **demo app** runs on a fixed port (e.g. **3001**). The test app’s redirect URIs must include `http://localhost:3001/auth/oauth-callback` (or the framework’s callback path).
- Pre-setup and TestDataClient must pass **`appUrl`** (e.g. `http://localhost:3001`) when calling the setup-test-app endpoint. The backend then sets `defaultCallbackUri` and `redirectUris` for that app. No need to configure the callback URL manually in the Bridge admin UI.
- Use the same `appUrl` / `baseURL` everywhere: Playwright `baseURL`, `webServer.url`, pre-setup `appUrl`, global-setup `appUrl`.

### 1.4 Test Categories and Specs

Implement (or adapt) the following test files. Not every plugin has all features; omit or stub what doesn’t apply.

| Category | Spec file | What it covers |
|----------|-----------|----------------|
| **Bootstrap** | `bootstrap/bridge-init.spec.ts` | Demo loads without errors; Bridge bootstrap initializes (no auth required). |
| **Public routes** | `route-guard/public-routes.spec.ts` | Home (or public) page is accessible without login. |
| **Protected routes** | `route-guard/protected-routes.spec.ts` | Unauthenticated user is redirected to login; authenticated user can access protected page and sees profile (or equivalent). |
| **Feature-flag routes** | `route-guard/feature-flag-routes.spec.ts` | Route guarded by a feature flag redirects or shows content as per flag state; unauthenticated behavior. |
| **Auth: login redirect** | `auth/login-logout.spec.ts` | Clicking login redirects to Bridge auth URL (assert URL contains `/auth/` or `/login`; do not require app ID in URL). |
| **Auth: navbar and logout** | `auth/login-logout.spec.ts` | After login, navbar shows authenticated links; logout clears tokens and shows login again. |
| **Auth: token persistence** | `auth/token-persistence.spec.ts` | After login, tokens survive page reload (e.g. check `localStorage` for `bridge_tokens` or equivalent). |
| **Auth: full login flow** | `auth/login-logout.spec.ts` | Full UI login flow (email → password → redirect back) and tokens present. |
| **Feature flags** | `feature-flags/feature-flags.spec.ts` | Cached/live/negated flag rendering if the demo exposes it. |
| **Team** | `team/team-management.spec.ts` | If the plugin has team/iframe handover: iframe loads and auth handover works (or skip). |

### 1.5 Assertion Conventions

- **Do not** require the Bridge **app ID** to appear in the page URL. It is set in config and/or localStorage; assert on redirect to `/auth/` or `/login` instead.
- Prefer **pathname** for “redirected to home” (e.g. `pathname === '/'`) so it works with any base URL/port.
- For **dynamic content** (e.g. profile email), use a stable selector: `page.locator('p').filter({ hasText: testUser.email })` or equivalent. Avoid relying on `data-testid` if you cannot change the demo app markup.
- Use **timeouts** from a shared fixture (e.g. `MED_TIMEOUT`, `LONG_TIMEOUT`) for network and async UI.

### 1.6 Environment Variables

- **Config layer** (e.g. `config/.env.test.local`): `PLAYWRIGHT_TEST_API_KEY`, `APP_DOMAIN`, optional `LOCAL_BASE_URL`, `LOCAL_AUTH_BASE_URL`, `LOCAL_CLOUD_VIEWS_URL`, `LOCAL_TEST_DATA_API_URL`. For stage/prod, use the same keys with stage/prod URLs. Provide `config/.env.test.local.example` with comments.
- **Demo app** (e.g. `demo/.env.test.local`): Framework-specific app ID variable (e.g. `VITE_BRIDGE_APP_ID`). Pre-setup overwrites this with the app ID from setup-test-app. Do not commit real secrets; ignore `.env` and `.env.*` except `.env.*.example`.

---

## 2. Implementation Instructions

Follow these steps when adding Playwright E2E to a Bridge plugin repo.

### Step 1: Prerequisites

- **Bridge API** with test data API available: `POST /account/test/playwright/setup-test-app`, `POST/DELETE /account/test/playwright/account`, `GET /account/test/playwright/health`, `POST /account/test/playwright/purge`. Endpoint must accept `appUrl` (default e.g. `http://localhost:3001`) so redirect URIs match the demo.
- **Node/bun** and **Playwright** installed in the plugin repo.
- **Demo app** that integrates the Bridge plugin and can be started with a test mode (e.g. `--mode test.local`) loading env from e.g. `demo/.env.test.local`.

### Step 2: Install and configure Playwright

- Add dev dependencies: `@playwright/test`, and if needed `dotenv`.
- Run `npx playwright install` (browsers).
- Add to `.gitignore`: `test-reports/`, `e2e/playwright/.auth/` (or your auth storage path), and any local env files except examples.

### Step 3: Create environment config

- Create `e2e/playwright/config/environments.ts` (or equivalent):
  - Read env from `config/.env.test.local` (or project root).
  - Export `getEnvironmentConfig('local' | 'stage' | 'prod')` returning `baseUrl`, `authBaseUrl`, `cloudViewsUrl`, `testDataApiUrl`, `testDataApiKey`, `appId`, `appDomain`.
  - Demo `baseUrl`: when tests run on host, use `process.env.LOCAL_BASE_URL || 'http://localhost:3001'` (or the port your demo uses). When running in a container, use the appropriate service URL.
  - `appId` must come from env (set by global-setup), e.g. `requireEnv('BRIDGE_TEST_APP_ID')`.
- Create `config/.env.test.local.example` with all required and optional variables and short comments.

### Step 4: TestDataClient

- Copy or reimplement `e2e/playwright/utils/test-data-client.ts`:
  - Constructor takes base URL (test data API), API key, app domain.
  - Methods: `healthCheck()`, `createTestAccount(options?)`, `removeTestAccount(email)`, `setupTestApp(domain, appName, ownerEmail, ownerPassword?, appUrl?)`, `purge()`.
  - `setupTestApp` must pass `appUrl` (e.g. `http://localhost:3001`) so the backend configures redirect URIs for the demo.
- Provide a factory that builds the client from env (e.g. `createTestDataClientFromEnv()` using `getEnvironmentConfig`).

### Step 5: Pre-setup script

- Create `e2e/playwright/pre-setup.ts` (or `.js`):
  - Load env from `config/.env.test.local` (and optionally project).
  - Call TestDataClient `setupTestApp` with domain (e.g. `BRIDGE_SVELTE_TEST_DASHBOARD`), app name, owner email/password, and **appUrl** = `http://localhost:3001` (or your demo port).
  - Write the returned **app ID** into the demo env file (e.g. `demo/.env.test.local`) by replacing or appending the line that sets the app ID (e.g. `VITE_BRIDGE_APP_ID=...`).
  - Exit 0 on success, non-zero on failure.
- Ensure the demo app reads the app ID from this env file when started in test mode.

### Step 6: Global setup

- Create `e2e/playwright/global-setup.ts`:
  - Load env (same as pre-setup).
  - Optionally: create TestDataClient, run health check, run purge.
  - Get app info (from setup-test-app or a dedicated endpoint) if needed, then set `process.env.BRIDGE_TEST_APP_ID` (and optionally owner email) so fixtures can read them.
  - Export a default function (Playwright global setup contract).

### Step 7: Fixtures

- **Timeouts** (`e2e/playwright/fixtures/timeouts.ts`): export `LONG_TIMEOUT`, `MED_TIMEOUT`, `SHORT_TIMEOUT` (e.g. 30s, 10s, 5s).
- **Auth** (`e2e/playwright/fixtures/auth.ts`):
  - Extend Playwright’s `test` with fixtures: `testDataClient`, `envConfig`, `testUser` (create account in fixture, remove in teardown), `authenticatedPage` (navigate to app, run login helper, yield page).
  - Export `loginViaBridgeAuth(page, email, password, envConfig)`: go to app home, click login, wait for auth URL, fill email, continue, fill password, sign in, wait for redirect back and for tokens in localStorage (or equivalent).
  - Use selectors that work with your Bridge auth UI (e.g. `#email`, `input[name="username"]`, `#password`, `button:has-text("Continue")`, `button:has-text("Sign in")`).
- **Clean page** (`e2e/playwright/fixtures/clean-page.ts`): provide a fresh browser context and page (no auth), with cleanup.

### Step 8: Playwright config

- Create `playwright.config.ts` at repo root:
  - `testDir`: e.g. `./e2e/playwright/tests`.
  - `globalSetup`: path to global-setup.
  - `use.baseURL`: `process.env.LOCAL_BASE_URL || 'http://localhost:3001'`.
  - `webServer`: command to start the demo (e.g. `cd demo && npm run dev -- --mode test.local`), `url` = same as baseURL, `reuseExistingServer: !process.env.CI`.
  - Projects: at least `local`, `local-no-auth`, and optionally `stage`, `prod`. Use env or project name to pick the right backend URLs in environment config.
  - Apply auth fixtures to projects that need them (exclude `local-no-auth` if that’s for login flow tests only).

### Step 9: NPM scripts

- In root `package.json` add scripts, for example:
  - `test:e2e`: run pre-setup then Playwright (e.g. `bun run e2e/playwright/pre-setup.ts local && playwright test --project=local`).
  - `test:e2e:stage`: pre-setup for stage then `playwright test --project=stage`.
  - `test:e2e:prod`: same for prod if desired.
- Document in README that the first run creates the test app and writes the app ID into the demo env.

### Step 10: Write the specs

- Create the spec files under `e2e/playwright/tests/` as in the table in §1.4.
- Use the auth fixture for tests that need an authenticated user; use clean-page for unauthenticated or login-flow tests.
- Follow assertion conventions (§1.5): no app ID in URL assertions; pathname for redirects; stable selectors for dynamic content; shared timeouts.

### Step 11: README

- Add an “E2E tests” section: how to run (`npm run test:e2e` / `bun run test:e2e`), that pre-setup creates the app and writes app ID, required env (point to `config/.env.test.local.example`), and optional note about stage/prod.

---

## 3. Reference: bridge-svelte layout

For a concrete reference, see this repo’s structure:

```
playwright.config.ts
config/.env.test.local.example   # copy to config/.env.test.local, fill in values
e2e/playwright/
  config/environments.ts
  fixtures/auth.ts
  fixtures/clean-page.ts
  fixtures/timeouts.ts
  global-setup.ts
  pre-setup.ts
  utils/test-data-client.ts
  tests/
    bootstrap/bridge-init.spec.ts
    route-guard/public-routes.spec.ts
    route-guard/protected-routes.spec.ts
    route-guard/feature-flag-routes.spec.ts
    auth/login-logout.spec.ts
    auth/token-persistence.spec.ts
    feature-flags/feature-flags.spec.ts
    team/team-management.spec.ts
    sdk-auth/sdk-login.spec.ts            # SDK login flow (no redirect)
    sdk-auth/sdk-signup.spec.ts           # signup form basic smoke test
    sdk-auth/sdk-signup-full.spec.ts      # full signup → verify email → set password → login
    sdk-auth/sdk-auth-alternatives.spec.ts# magic link, passkeys, SSO buttons, forgot password
    subscription/subscription-plans.spec.ts  # mocked plan rendering and state
    subscription/subscription-flows.spec.ts  # real API plan select/switch; optional Stripe
```

### Running subscription flow tests

The `subscription-flows.spec.ts` tests call the test data API to create/delete plans and set tenant plans. They require a running bridge-api with test data endpoints enabled.

The Stripe checkout test is skipped by default. To enable it, add Stripe test-mode keys to `config/.env.test.local`:

```
STRIPE_TEST_PK=pk_test_...
STRIPE_TEST_SK=sk_test_...
```

### Running full signup flow tests

`sdk-signup-full.spec.ts` uses `getSignupVerificationLink` to retrieve the email verification token without an inbox. This requires the bridge-api to support `GET /account/test/playwright/signup-verification-link`. If the endpoint is not available, the test skips automatically with a clear message.

---

## 4. Checklist for a new plugin

- [ ] Bridge API test data API available; `appUrl` supported in setup-test-app.
- [ ] Playwright and browsers installed; `.gitignore` updated.
- [ ] Environment config and `.env.test.local.example` in place.
- [ ] TestDataClient with `appUrl` in setup-test-app.
- [ ] Pre-setup creates app and writes app ID to demo env.
- [ ] Global-setup sets `BRIDGE_TEST_APP_ID` (and optional owner email).
- [ ] Fixtures: timeouts, auth (testUser, authenticatedPage, loginViaBridgeAuth), clean-page.
- [ ] `playwright.config.ts` with correct baseURL, webServer, globalSetup, projects.
- [ ] NPM scripts for local (and optionally stage/prod).
- [ ] Specs for bootstrap, public/protected/feature-flag routes, auth, feature flags, team (as applicable).
- [ ] Assertions follow conventions (no app ID in URL; pathname; stable selectors).
- [ ] README updated with E2E section.
