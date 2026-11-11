# Changelog

## [1.0.0-alpha.6] - unreleased

Needs `@nebulr-group/bridge-auth-core` 1.0.0-alpha.6.

### Added

- **Hosted mode.** `hosted: { redirectUri?, linkAddress? }` in the config: `/auth/sign-in` (`HostedSignIn`) starts a sign-in request and sends the browser to the page Bridge hosts for the app; `/auth/callback` (`HostedCallback`) checks the return and trades the code, then goes on to where the person was going. `redirectUri` defaults to `<origin><auth base>/callback`, which must be one of the app's registered sign-in returns.
- **Signing in for other apps' sign-in requests.** `handoff: { requests: true }`: opened with `?request=<id>`, every form signs in on the request, and a finished sign-in (password, sign-in link, passkey, workspace step, or a sign-up's email link) sends the browser to the app's return with the code, making no session here. For a page that signs people in for other apps.
- **`linkAddress`** in the config: which of the app's registered email-links addresses sign-up, sign-in link and recovery emails link to, for an app with several sign-in pages.

### Changed

- `handoff.loopback` is optional, so a page can take sign-in requests only.

## [1.0.0-alpha.5] - unreleased

Needs `@nebulr-group/bridge-auth-core` 1.0.0-alpha.5.

### Added

- **Passkeys.** When the app offers them and the browser can use them, `SignInForm` shows "Sign in with a passkey", and its email field offers the person's passkeys in the browser's autofill list (`autocomplete="username webauthn"`) where the browser supports it; the button stays for a phone or a security key. A closed dialog leaves the form as it was, with a short note. Under the button, "Email me a link to set up a passkey" sends a link that lands on the new `/auth/passkey-setup` page (`PasskeySetupLanding`): on the device that asked, a click opens the browser's dialog, the passkey is made and the person is signed in. With `storage: 'memory'`, only that link's PKCE verifier waits in `localStorage`, as long as the link works (24 hours).
- **`PasskeyManager`**, for a settings page: the signed-in person's passkeys with their name, when each was added and last used and whether it syncs to their other devices; adding one from this device and removing one. Adding or removing needs a recent sign-in, and the last way to sign in cannot be removed.

## [1.0.0-alpha.4] - unreleased

Needs `@nebulr-group/bridge-auth-core` 1.0.0-alpha.4.

### Added

- **Sign-in links (magic links).** When the app offers them, `SignInForm` shows "Email me a sign-in link" under the password fields, or on its own when the app offers no passwords. The link lands on the new `/auth/magic-link` page (`MagicLinkLanding`), which signs the person in on the device that asked. Each link works once, for 15 minutes; on another device the page says to open it where it was asked for. With `storage: 'memory'`, only the link's PKCE verifier waits in `localStorage`, for the link's 15 minutes at most.  Like the sign-up link page, it never waits without end: finishing fails after 30 seconds, and once signed in it goes on again if a navigation cancels it.

## [1.0.0-alpha.3] - unreleased

Needs `@nebulr-group/bridge-auth-core` 1.0.0-alpha.3.

### Fixed

- **A sign-up's email link no longer stays on "Finishing sign-up…"** after it has signed the person in. Signing in makes the route guard run again as the session and the flags settle, and that navigation could cancel the page's own way on to `auth.afterSignIn`, so the page stayed put with its spinner. The page now goes again when that happens, and after three tries shows a link to go on.
- **The email-link page never waits without end.** Finishing the link fails with an error after 30 seconds, and an error anywhere on the way is shown instead of leaving the spinner.

## [1.0.0-alpha.2] - unreleased

Needs `@nebulr-group/bridge-auth-core` 1.0.0-alpha.3.

### Fixed

- **`storage: 'memory'`: a sign-up's email link works in a new tab of the same browser**, also after the tab that started the sign-up is closed. Memory mode now keeps the sign-up's PKCE verifier, and only that, in `localStorage` while the email link is on the way: for the link's 15 minutes at most, removed once used. The session and the visitor id stay in memory. When the tab that started the sign-up is still open, the link is still handed to it. On another device the link is still refused (`wrong-device`).

## [1.0.0-alpha.1] - unreleased

Needs `@nebulr-group/bridge-auth-core` 1.0.0-alpha.2.

### Added

- **Invites.** `/auth/invite` (`InviteLanding`) shows the workspace an invite is for, then signs a new person up from the invite (no email to verify; they land signed in, in the workspace), signs a person with an account in and accepts on the way, or accepts with one button for someone signed in already. Revoked, used and expired invites, an invite for another address and a member already each say so. The invite's token is cleared from the address bar and the history.
- **`storage: 'memory'`** in `bridgeBootstrap`: nothing of Bridge's is written to `localStorage` or `sessionStorage`. A sign-up's email link, which opens in a new tab, is handed to the tab that started the sign-up and finishes there.
- `SignUpForm` takes `invite` (sign up from an invite: no email field, signed in at once) and `onSignIn`.

### Changed

- `SignInForm` no longer takes `invite`: `InviteLanding` signs in, then accepts.

## [1.0.0-alpha.0] - unreleased

A new major version, built on `@nebulr-group/bridge-auth-core` 1.0 and the new Bridge API. It is an alpha: it runs in the browser (`ssr = false`) and signs people in with email and password.

### Changed

- **One setting.** `PUBLIC_BRIDGE_ISSUER` replaces `VITE_BRIDGE_APP_ID`, `VITE_BRIDGE_API_BASE_URL` and `VITE_BRIDGE_HOSTED_URL`. Every endpoint is read from the issuer. The issuer must be `https`, except `http://localhost` on your own machine.
- **Sign-in pages in your app.** `<BridgeAuthRoutes>` serves `sign-in`, `sign-up`, `verify-email`, `forgot-password`, `set-password`, `invite`, `workspaces` and `handoff`. Email links land on your email-links address with the token in the fragment. `LoginForm` is now `SignInForm`; `SignupForm` is `SignUpForm` plus `VerifyEmail`; `ForgotPassword` and `SetPassword` are two components; `TenantSelector` and `WorkspaceSelector` are one `WorkspaceChooser`.
- **Gates are flags only.** Route rules, `<FeatureFlag>`, the paywall, the plan picker, the billing portal and the team panel read flag results, including the standard flags `bridge-billing-manage`, `bridge-team-manage` and `bridge-app-active`. Nothing reads a role, a privilege or the plan.
- **`bridgeFetch` only.** The global `fetch` patch is gone. `bridgeFetch` sends the person's token only to your page's origin, Bridge and the `tokenOrigins` you list.
- **Stores** are `session`, `user`, `workspace`, `workspaces`, `me`, `flags`, `billing`, `plans`, `usage` and `liveStatus`.

### Added

- **Server helpers** in `@nebulr-group/bridge-svelte/server`: `bridgeHandle` for `hooks.server.ts` checks Bridge tokens and keys against your app's revocation list (other `Authorization` headers are left to your app, and `skip` leaves routes out), `requireActor`, `meter` ("count this") and `flagsFor`. The entry refuses to load in a browser.
- **Hand-off mode** for a sign-in page that signs a person in for a command-line tool and returns the code, `state` and `iss` to its loopback callback (`http://127.0.0.1:<port>/callback`).
- **Live updates** through auth-core's Live client: flags, billing, the team and the session refresh within a second of a change.

### Removed

- Hosted sign-in, MFA, magic links, passkeys and company sign-in, for now. They return as sign-in steps.
- `QuotaGate`, `Entitled`, the entitlements store and every direct plan or role check: gate on a flag whose rule names the plan feature.
- Usage counted from the browser, the tracking helpers, and the re-exports of auth-core.
- API token management, for now.

## [0.9.4] - 2026-11-04

### Fixed

- **Sign-in links match your app.** "Sign up", "Log in" and the other text links on the sign-in pages take the form's text colour and font, instead of the browser's default blue.
- **Sign-in method icons stay visible.** When your app's buttons use larger text, the passkey and magic-link buttons grow to fit their label instead of shrinking the icon out of view.

## [0.9.3] - 2026-10-14

### Changed

- **Bridge pages follow your app's text.** Every text size on the sign-in and subscription pages now scales from your page's body text size, alongside the font family and text colour they already inherited. At the usual 16px nothing changes; set `--bridge-font-size` to size Bridge text differently.
- **Your CSS always wins.** Bridge's styles now live in a CSS cascade layer named `bridge`, so any normal CSS you write against a Bridge class or data attribute overrides it, whatever the load order or specificity, with no `!important`. CSS inside one of your own layers declared before `bridge`, including Tailwind utility classes on Bridge's elements, still ranks below it.

### Added

- **Weight and shadow settings.** `--bridge-font-weight-heading`, `--bridge-font-weight-button`, `--bridge-font-weight-label` and `--bridge-button-shadow` let an app with heavy type or hard drop shadows carry that look onto the Bridge pages. `--bridge-card-shadow` now also styles the plan-change dialog. Every default is the previous look.

## [0.9.2] - 2026-10-14

### Changed

- **After checkout, people land back in the app.** A completed checkout or a Free plan pick now returns to the subscription page with a "You're on Pro now" banner, with no separate confirmation step. Set `billing.successRoute` to land on any page of your app, and put `<BridgeCheckoutNotice />` there for the same banner, or read `checkoutResult` for a message of your own. The old confirmation page at `/subscription/success` still works for apps that point to it.
- **A subscription page that fits your app.** Plan cards and the current-plan panel have their own surface built from your `--bridge-*` tokens, so they look right on any app background. Prices are shown large and formatted for their currency, buttons say "Upgrade to" or "Switch to", the current plan is marked in your primary colour, and its renewal date and card are shown. Two optional tokens, `--bridge-card-bg` and `--bridge-card-shadow`, tune the cards. Plan buttons no longer read "Select free plan" or "29 USD / month", so tests that match that text need updating.

## [0.9.0] - 2026-09-30

### Added

- **One-line start.** Bridge now starts with one line and no arguments: it reads its settings from the environment, settings you pass explicitly win, and the app shell shows nothing until Bridge is ready. Previously every setting had to be copied into the layout by hand, and a forgotten one could quietly point a stage app at the production API.
- **Built-in sign-in pages.** One file now serves every login page, including the one that verification emails link to, so a missing page can no longer break signup. Restyle the frame around the forms, or take over any single page by creating it; the rest keep working. Hosted login uses the same file.
- **Built-in subscription and paywall pages.** One file serves the subscription page, the paywall and the checkout success and error pages, so the manage-billing button always has somewhere to go. A welcome page for onboarding is a one-line opt-in.
- **Upgrade dialog at a plan limit.** When the server refuses an action because a plan limit is reached, the app shows the upgrade dialog itself, with no Bridge code on the page. Two components cover buttons that should react before the click. A limit that has not loaded yet no longer reads as zero and disables the feature.
- **Why a feature is off.** A feature flag now tells the app why it is off: not on the plan opens the upgrade dialog, not allowed for this person tells them to ask an admin, and switched off simply hides it. This works the same in the browser and on the backend.
- **Plan features in the plan picker.** The plan picker lists the features each plan includes, and the upgrade dialog names the plans that include the feature being asked for.
- **Seat limits on the built-in team page.** On a plan with a seat limit, the team page stops invitations at the limit, and the member count stays correct for everyone.
- **More of Bridge is importable.** The team dialogs, the usage reporter, the quota reader and other pieces the guides tell you not to rebuild can now be imported from this package.

### Changed

- **Core package included.** The core Bridge package now installs with the plugin, so there is no second package to add.
- **Theming.** The theme variables are the documented way to restyle Bridge to match your app, and the demo app shows the reference integration you can copy.
- **Guides.** The integration guides are much shorter and describe the decisions you make, with one page explaining how limits, upgrades and customization work. They teach feature flags as the way to gate pages, links and buttons, and a page that checks the plan directly logs a one-time note in development.

### Fixed

- **Role changes reaching open apps.** A role change made by an admin now reaches the person's open app without a reload. Since 0.8.2 it could be lost while the app was reconnecting.
- **Billing screens stay current.** Plans added after a tab was opened now appear without a reload, the success page shows the new plan straight after checkout instead of "Subscription unavailable", and choosing Free takes you into the app instead of leaving you on the plan picker.
