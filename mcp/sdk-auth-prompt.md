# Bridge SvelteKit — In-app Sign-in (bridge-svelte 1.0)

You are adding sign-in to a SvelteKit app with `@nebulr-group/bridge-svelte` 1.0. The sign-in, sign-up and password pages render inside the app's own layout; the plugin serves every one of them from one file. If Bridge is not set up in the project yet, do `bridge guide svelte` (MCP: `get_integration_guide topic=integration framework=svelte`) first: install from the `alpha` tag, the one setting `PUBLIC_BRIDGE_ISSUER`, `bridgeBootstrap` and `<BridgeBootstrap>`.

## The one rule for app code

**Every gate in app code is a flag.** Who may see a page, a link or a button is a flag's rule (a privilege, a plan feature or a rollout), never a role or privilege check written into the app. Signed in or not is the one thing the route rules decide themselves (`public: true`). The browser shows or hides; your server checks the token on every call (`bridgeHandle` from `@nebulr-group/bridge-svelte/server`). Run `npx @nebulr-group/bridge-cli@alpha check gates` before calling the work done.

## Before you start: the app's settings in Bridge

- **Addresses.** `bridge app setup --url <dev origin>` registers the dev origin as a `browser-origin` and `<origin>/auth` as the `email-links` address, and writes the issuer into `.env`. Add production later with `bridge app address add <url> --use browser-origin` and `bridge app address add <url>/auth --use email-links`. Without the email-links address, sign-up, reset and invite emails cannot reach the app's pages. MCP: `update_app` with `allowedOrigins` (replaces the whole list) and `uiUrl`.
- **Sign-in methods** are the developer's choice: ask which they want before changing any. `bridge auth methods list`, then `bridge auth methods enable <method>` / `disable <method>` with `password`, `magicLink` or `passkeys` (MCP: `update_auth_methods`). Bridge refuses to switch off the last one. Social providers switch on only after their client id and secret are saved in the Bridge dashboard; neither the CLI nor the MCP takes them. `bridge auth config` shows the current setup.
- **Passkeys** need every page address people sign in from registered as a `browser-origin`.

The forms show exactly the methods the app's sign-in options list, so changing a method needs no code change.

## The one file

```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

| Page | What it does |
|---|---|
| `/auth/sign-in` | Email and password, a sign-in link by email, a passkey or a social provider, as the app offers them; then the workspace choice for a person in several, and the second step when the workspace asks for one |
| `/auth/sign-up` | Email, password and name. Bridge emails a link to prove the address; nothing is made before that |
| `/auth/verify-email` | Where the sign-up link lands: finishes the sign-up and signs in |
| `/auth/forgot-password` | Asks for a reset link |
| `/auth/set-password` | Where the reset link lands: sets a new password, then goes to sign-in |
| `/auth/invite` | Where an invite link lands: shows the workspace, then signs up or in and accepts |
| `/auth/workspaces` | Switches workspace while signed in |
| `/auth/magic-link` | Where a sign-in link lands |
| `/auth/passkey-setup` | Where a passkey setup link lands |

Bridge's emails link to the email-links address with the token in the fragment (`https://app.example.com/auth#bridge=verify-email&token=…`); `bridgeBootstrap` sends the browser to the matching page, which takes the token and clears it from the address bar. Move the pages with `bridgeBootstrap({ auth: { base: '/account' } })` and the file to `src/routes/account/[...bridge]/+page.svelte`; register `<origin>/account` as the email-links address then.

Where people land: `auth.afterSignIn` (default `/`) when there is no page to return to, `auth.afterSignOut` (default the sign-in page). The page to return to travels in `?redirectUri=` (`returnToParam`).

## Match the app's design, always

The pages render inside the app's `+layout.svelte`, so they already take its navigation, font and text colour. Then set the `--bridge-*` tokens from the app's own styling as `bridge guide svelte branding` describes. Do not leave Bridge's defaults in an app that has a look of its own, and do not restyle Bridge's internals.

## Customising further: take the lowest rung that does the job

0. **The app's layout** around every page (nothing to do).
1. **Tokens**: `--bridge-*` in the app's CSS (`bridge guide svelte branding`).
2. **Frame and headings**: `<BridgeAuthRoutes>` takes a `frame(page, content)` snippet around every page and a `heading(page)` snippet:

   ```svelte
   <BridgeAuthRoutes>
     {#snippet frame(page, form)}
       <div class="split"><aside>Acme</aside>{@render form()}</div>
     {/snippet}
     {#snippet heading(page)}
       <h2>{page === 'sign-in' ? 'Welcome back' : 'Acme'}</h2>
     {/snippet}
   </BridgeAuthRoutes>
   ```

3. **Take over one page**: `src/routes/auth/sign-in/+page.svelte` wins over `[...bridge]`. Put the form inside with your own words:

   ```svelte
   <script lang="ts">
     import { SignInForm } from '@nebulr-group/bridge-svelte';
   </script>

   <h1>Welcome back</h1>
   <SignInForm heading={null} />
   ```

   The forms are `SignInForm`, `SignUpForm`, `VerifyEmail`, `ForgotPassword`, `SetPassword`, `InviteLanding`, `WorkspaceChooser`, `MagicLinkLanding`, `PasskeySetupLanding`. Each takes `heading` (`null` for none), `headingSnippet`, `messages`, `class` and `style`. `SignInForm` also takes `showSignupLink`, `signupHref`, `showForgotPassword`, `forgotPasswordHref` and `onSignIn`.
4. **Headless**: your own screen on `getBridge()`, with `errorMessage(error, translator())` for Bridge's words:

   ```ts
   import { getBridge, errorMessage, translator } from '@nebulr-group/bridge-svelte';

   try {
     const step = await getBridge().signIn.start({ email, password });
     if (!step.done && step.next === 'workspace') await step.choose(step.workspaces[0].id);
   } catch (error) {
     message = errorMessage(error, translator());
   }
   ```

Wording and language: `bridgeBootstrap({ locale: 'de', messages: { 'login.submit': 'Anmelden' } })`; a form's own `messages` prop changes one form. Twelve languages ship.

## Signed in, signing out, switching workspace

```svelte
<script lang="ts">
  import { signedIn, workspace, ProfileName, SignOutButton } from '@nebulr-group/bridge-svelte';
</script>

{#if $signedIn}
  <a href="/auth/workspaces">{$workspace?.name}</a>
  <ProfileName />
  <SignOutButton />
{:else}
  <a href="/auth/sign-in">Sign in</a>
{/if}
```

`<SignOutButton>` ends the session here, in every open tab and at Bridge; `redirectTo` overrides `auth.afterSignOut`. Switching workspace at `/auth/workspaces` moves every tab; flags, billing and the team panel follow. A session Bridge ends (a password reset elsewhere, removal from the workspace) sends the person to sign in again with a note saying why.

## Actions that want a recent sign-in

Some calls (making a key, changing sign-in settings, removing a workspace) are refused with `reauthenticate` when the sign-in is old. Wrap them; never send the person to sign in again:

```ts
import { withRecheck } from '@nebulr-group/bridge-svelte';

await withRecheck(() => createKey(form));
```

The "Confirm it is you" dialog, rendered by `<BridgeBootstrap>`, asks once and runs the call again. A cancel rejects with `BridgeError` kind `cancelled`.

## Passkeys on a settings page

```svelte
<script lang="ts">
  import { PasskeyManager } from '@nebulr-group/bridge-svelte';
</script>

<PasskeyManager />
```

## Keeping the session out of the browser's storage

`bridgeBootstrap({ storage: 'memory' })` keeps the session in the page's memory only; a reload signs in again. The default `'local'` keeps it in `localStorage`. Choose memory only when the developer asks.

## Checklist

- [ ] One `src/routes/auth/[...bridge]/+page.svelte` with `<BridgeAuthRoutes />`, no other page under it that only renders a Bridge form
- [ ] The email-links address is `<origin>/auth` (or the moved `auth.base`), for dev and production
- [ ] The sign-in methods are the developer's choice (`bridge auth methods list`)
- [ ] The pages match the app's design through tokens (`bridge guide svelte branding`)
- [ ] Sign-out uses `<SignOutButton>`; actions that want a recent sign-in use `withRecheck`

## Verify

Run the terminal checks. If you have a browser tool, run the browser checks too. If you do not, list them for the developer, numbered, and start the summary with a Heads up line saying which checks were not run.

### Terminal checks

1. The build passes.
2. `bridge auth config` lists the methods the developer chose; `bridge app address list` shows the browser-origin and email-links addresses.
3. `npx @nebulr-group/bridge-cli@alpha check gates` lists nothing.

### Browser checks

1. A protected page sends a signed-out visitor to `/auth/sign-in`, and back to that page after signing in.
2. The developer signs up once at `/auth/sign-up` with a real address, opens the email, and lands signed in. Do not create test users.
3. "Forgot password" sends a link that lands on `/auth/set-password`.
4. Sign out lands on the sign-in page; `/auth/not-a-page` shows the app's 404.

If a step fails, `bridge event auth-attempts --user <their email>` (MCP: `debug_auth_issue`) gives the reason and the fix. When a check was not run, the summary starts with "Heads up: not verified in a browser".
