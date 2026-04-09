# bridge-svelte Cleanup Plan

Reviewed 2026-04-05. Only actionable items listed — everything else was reviewed and deemed solid.

## Work instructions

- Commit after each completed task before starting the next one
- Keep commit messages short — no detailed explanations
- Mark tasks as completed in the checklist below

## Progress

- [x] 1. Remove `client/stores/profile.store.ts` (legacy duplicate)
- [x] 2. Remove `shared/services/auth.service.ts` (unnecessary abstraction)
- [x] 3. Remove `shared/services/plan.service.ts` (unnecessary abstraction)
- [x] 4. Clean up `cn()` from public exports (already internal-only, no change needed)
- [x] 5. Add `<ProfileName />` component
- [x] 6. LoginForm: derive auth method visibility from AppConfig
- [x] 7. Remove `onLogin` from quickstart examples
- [x] 8. Add `signupRoute` to `BridgeConfig`
- [x] 9. Quickstart styles: clarify centering is optional
- [x] 10. Extract theming docs to standalone reference
- [x] 11. Restructure documentation (hosted quickstart + SDK guide + theming)
- [x] 12. Split `examples.md` into per-domain docs

## 1. Remove `client/stores/profile.store.ts` (legacy duplicate)

**File:** `bridge-svelte/src/lib/client/stores/profile.store.ts`

This file exports `profileState` (a renamed re-export of a raw readable store) and a no-op `fetchProfile()`. It's superseded by `shared/profile.ts` which exports the proper `profileStore` object with stores + helper methods.

Both are exported from `index.ts` — consumers should only use `profileStore` from `shared/profile.ts`.

**Steps:**
- Delete `src/lib/client/stores/profile.store.ts`
- Remove `export * from './client/stores/profile.store.js'` from `index.ts` (line 4)

## 2. Remove `shared/services/auth.service.ts` (unnecessary abstraction)

**File:** `bridge-svelte/src/lib/shared/services/auth.service.ts`

Every method is a one-liner delegating to `getBridgeAuth()`:
```ts
login: (options?) => getBridgeAuth().login(options),
logout: (options?) => getBridgeAuth().logout(options),
handleCallback: (code) => getBridgeAuth().handleCallback(code),
// etc.
```

Also contains two no-op backward-compat stubs (`startAutoRefresh`, `stopAutoRefresh`) and a `maybeRefreshNow` that auth-core already handles internally.

Consumers should use `getBridgeAuth()` directly or the stores already exported from `bridge-instance.ts` (`isAuthenticated`, `tokenStore`, etc.).

**Steps:**
- Delete `src/lib/shared/services/auth.service.ts`
- Delete `src/lib/shared/services/auth.service.d.ts`
- Remove `export * from './shared/services/auth.service.js'` from `index.ts` (line 58)
- Verify no internal components import from this file (grep for `auth.service`)

## 3. Remove `shared/services/plan.service.ts` (unnecessary abstraction)

**File:** `bridge-svelte/src/lib/shared/services/plan.service.ts`

Same pattern — 18 lines of one-liner delegations to `getBridgeAuth()`:
```ts
redirectToPlanSelection: () => getBridgeAuth().redirectToPlanSelection(),
getPlans: () => getBridgeAuth().getPlans(),
// etc.
```

**Steps:**
- Delete `src/lib/shared/services/plan.service.ts`
- Delete `src/lib/shared/services/plan.service.d.ts`
- Remove `export * from './shared/services/plan.service.js'` from `index.ts` (line 59)
- Verify no internal components import from this file (grep for `plan.service`)

## 4. Clean up `cn()` from public exports

**File:** `bridge-svelte/src/lib/client/utils/cn.ts`

A 3-line class name concatenation helper. Used internally by some components. Keep the file but remove it from the public API if it's currently exported.

**Steps:**
- Check if `cn` is exported from `index.ts` — if so, remove the export
- Keep the file for internal component use

## 5. Add `<ProfileName />` component (new)

Drop-in component that renders the authenticated user's display name. No configuration needed.

```svelte
<ProfileName />
<!-- renders: "John Doe" or "john@example.com" or nothing -->
```

Internally subscribes to the profile store and renders the best available name (`fullName` > `email` > empty). Outputs a `<span>` with a data attribute for consumer styling.

**Steps:**
- Create `src/lib/client/components/ProfileName.svelte`
- Export from `index.ts`
- Add to demo app

## 6. LoginForm: derive auth method visibility from AppConfig

`LoginForm` requires consumers to manually pass `showMagicLink`, `showForgotPassword`, `showPasskeys` as boolean props. But the app's `AppConfig` (from the API) already declares which auth methods are enabled. The component already reads `appConfigStore` for SSO connections — it should do the same for all other methods.

**Current:**
```svelte
<LoginForm showMagicLink showForgotPassword showPasskeys />
```

**Target:**
```svelte
<LoginForm />
<!-- auth methods shown/hidden automatically based on what the app has enabled -->
```

Props can remain as optional overrides (force show/hide), but defaults should come from AppConfig.

**Prerequisite:** Verify that `AppConfig` (from auth-core / the API) has flags for `magicLinkEnabled`, `passwordResetEnabled`, `passkeysEnabled`. If not, this is also a backend + auth-core change — add it to the backlog.

## 7. Remove `onLogin` from quickstart examples

The quickstart shows `onLogin={handleLogin}` with `goto('/dashboard')` as if it's required. It's not — the route guard already handles post-login redirect.

**Change:** Remove `onLogin` / `handleLogin` from quickstart code examples. Keep the prop on the component for advanced use cases (analytics, post-login side effects) and document it as optional.

## 8. Add `signupRoute` to `BridgeConfig`

`LoginForm` has a `signupHref` prop that consumers must manually set to point the "Don't have an account? Sign up" link to the right page. Same issue with `loginHref` on `SignupForm`.

**Solution:** Add `signupRoute` to `BridgeConfig` (alongside `loginRoute`). Both are explicit and required when using SDK auth. Components read from config automatically. Props remain as overrides.

Additionally, whether the signup link shows at all should be driven by `AppConfig` — if signups are disabled in the Bridge dashboard, the link should not render regardless of `signupRoute`.

**Route config summary for SDK auth:**

| Config field | Purpose | Needs a consumer route? |
|---|---|---|
| `loginRoute` | Where `<LoginForm />` lives | Yes |
| `signupRoute` | Where `<SignupForm />` lives | Yes |
| Forgot password | N/A — handled inline in LoginForm + Bridge hosted reset page | No |
| Magic link | N/A — inline in LoginForm, token auto-detected on return | No |
| MFA | N/A — LoginForm auto-renders MfaChallenge/MfaSetup inline | No |
| Tenant selection | N/A — LoginForm auto-renders TenantSelector inline | No |

## 9. Quickstart styles: clarify centering is optional

The quickstart adds custom CSS to center the login form on the page:
```css
.login-page { display: flex; justify-content: center; padding: 3rem 1rem; }
```

This is page layout, not Bridge-specific. The form works fine without it. Keep the CSS in the example but add a note explaining it's just for centering — not required for the component to function.

## 10. Extract theming docs to standalone reference

The styles/theming section (currently section 6 of the SDK quickstart) applies to all components, not just SDK auth. Extract to a standalone theming reference doc.

**Contents:**
- Full audit of every CSS variable in `styles.css` (current quickstart list is incomplete — only covers buttons/inputs/alerts, missing team, API token, subscription components)
- How `:where()` zero-specificity works
- Component-level overrides via `class`/`style` props
- Headless usage (skip the import, style everything yourself)

## 11. Restructure documentation

Current quickstart only covers SDK auth. Needs restructuring into separate docs:

**a) Hosted Auth Quickstart (primary, simplest path)**
- Install, configure, BridgeBootstrap, redirect-based login
- No LoginForm or SignupForm needed — auth happens on the Bridge hosted UI
- This is the "get started in 5 minutes" entry point

**b) SDK Auth Guide (separate doc)**
- For users who want in-app login/signup forms
- Covers LoginForm, SignupForm, and all inline flows (MFA, passkeys, magic link, SSO, tenant selection)
- The current quickstart becomes this guide (refactored)

**c) Theming & Styles Reference (separate doc)**
- Extracted from the current quickstart section 6
- See item 10 above

## 12. Split `examples.md` into per-domain docs

The current `examples.md` covers everything in one file. Split into focused documents:

| Doc | Covers |
|---|---|
| **Auth** | LoginForm, SignupForm, MFA, passkeys, magic link, SSO, tenant/workspace selection |
| **Payments** | PlanSelector, Stripe checkout, subscription status, portal URL |
| **Feature Flags** | FeatureFlag component, programmatic flag checks, route-level gating |
| **Team Management** | TeamManagementPanel, user CRUD, roles, profile/workspace forms |
| **API Tokens** | ApiTokenManagement, creating/revoking tokens, privileges |

Each doc is self-contained — a user looking for payment integration doesn't scroll past MFA setup.

---

## Not changing (reviewed and confirmed solid)

| Area | Verdict |
|---|---|
| SDK auth components (12 components) | Keep — centerpiece of the product |
| Team components (8 components) | Keep — well-structured, standard Svelte patterns |
| ApiTokenManagement | Keep — works fine as single file |
| PlanSelector | Keep — clean state machine |
| FeatureFlag | Keep — simple and focused |
| Core architecture (bridge-instance, BridgeBootstrap, config store) | Keep — well-designed |
| styles.css | Keep — minimal baseline with CSS vars |
| logger.ts | Keep |
| Dependencies | Clean — only auth-core in prod deps |
