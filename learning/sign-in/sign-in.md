# Sign-in pages

`<BridgeAuthRoutes />` in `src/routes/auth/[...bridge]/+page.svelte` serves every page a person signs in, signs up or recovers a password on. The plugin owns the list, so no page an email links to can be missing.

| Page | What it does |
|---|---|
| `/auth/sign-in` | Email and password, or a sign-in link by email when your app offers it, then the workspace choice when the person belongs to several |
| `/auth/sign-up` | Email, password and name. Bridge emails a link to prove the address; nothing is made before that |
| `/auth/verify-email` | Where the sign-up link lands: it finishes the sign-up and signs the person in |
| `/auth/forgot-password` | Asks for a reset link |
| `/auth/set-password` | Where the reset link lands: sets a new password, then goes on to sign-in |
| `/auth/invite` | Where an invite link lands: shows the workspace, then signs the person up or in and accepts the invite |
| `/auth/workspaces` | Switches workspace while signed in |
| `/auth/magic-link` | Where a sign-in link lands: signs the person in on the device that asked for it |
| `/auth/handoff` | Hand-off mode only: signs in for a program on the person's machine |

An unknown page under `/auth` gets your app's own 404.

## What people see

- **A wrong email or password** says "Invalid email or password." whether or not the address has an account. Sign-up and password recovery also answer the same way for both, so the pages never reveal who has an account.
- **The workspace choice** appears after the password when the person belongs to several workspaces. Pick one and they are in.
- **The sign-up link** finishes the sign-up only in the browser that started it. Opened on another device, it says to open it where they signed up, and the link still works there.
- **A sign-in link** ("Email me a sign-in link") works once, for 15 minutes, and only in the browser that asked for it. Opened on another device, it says to open it where they asked, and the link still works there. The page answers the same whether or not the address has an account.
- **Setting a new password** signs nobody in and ends every session of the account, so the page sends the person to sign in with the new password.
- **When Bridge ends a session** (a password reset elsewhere, or removal from the workspace), the person is sent to sign in again with a short note saying why.

## Email links

Bridge's emails link to your email-links address with the token in the fragment: `https://app.example.com/auth#bridge=verify-email&token=…`. The fragment never reaches a server log or a `Referer` header. `bridgeBootstrap` sends the browser to the matching page, and that page takes the token and clears it from the address bar.

## Sign-in links

Switch sign-in links on in your app's sign-in settings in Bridge. The sign-in form then shows "Email me a sign-in link" under the password fields, or on its own when your app offers no passwords. The person types their email and gets a link; it lands on `/auth/magic-link`, which signs them in.

Each link works once, for 15 minutes, and only in the browser that asked for it: the SDK keeps a one-time key (a PKCE verifier) for it until the link is opened, at most 15 minutes. With `storage: 'memory'`, that key alone waits in `localStorage`, so the link can open in a new tab; the session stays in memory. A link opened in another browser is refused, and still works in the right one. Asking again sends a new link; only the newest one works in this browser.

Headless:

```ts
await getBridge().magicLink.start(email);        // always the same answer
const step = await getBridge().magicLink.finish(token); // on /auth/magic-link
```

## Invites

An invite's email lands on `/auth/invite`, which shows the workspace the invite is for and then:

- **A person with no account** chooses a password (and their name). The invite's link proved the address, so there is no email to wait for: they land signed in, in that workspace, with the role they were invited with.
- **A person with an account** signs in, and the invite is accepted on the way. With several workspaces, they may be asked which to open first; the invite then moves them into the new one.
- **Someone signed in already** sees "Join Acme" and accepts with one button.

An invite that no longer works says why: revoked or expired (ask for a new one), or used already (sign in). An invite sent to another address says so and offers to sign out, and a member already is told so and goes on. Invites last 30 days, and sending one again stops the old link working. Invites are sent from the [team panel](../team/team.md).

## Signing out and switching workspace

```svelte
<script lang="ts">
  import { SignOutButton, ProfileName, workspace } from '@nebulr-group/bridge-svelte';
</script>

<a href="/auth/workspaces">{$workspace?.name}</a>
<ProfileName />
<SignOutButton />
```

Signing out ends the session here, in every open tab, and at Bridge. Switching workspace moves every tab to the new workspace; flag results, billing and the team panel follow.

## Using the forms on your own pages

Each page is also a component you can place anywhere: `SignInForm`, `SignUpForm`, `VerifyEmail`, `ForgotPassword`, `SetPassword`, `InviteLanding` and `WorkspaceChooser`. For example, your own sign-in page with your own words:

```svelte
<!-- src/routes/auth/sign-in/+page.svelte: SvelteKit prefers it over [...bridge] -->
<script lang="ts">
  import { SignInForm } from '@nebulr-group/bridge-svelte';
</script>

<h1>Welcome back</h1>
<SignInForm heading={null} />
```

`SignInForm` goes to the page the person came from after signing in (else `auth.afterSignIn`), or calls `onSignIn` if you pass it. Every form takes `heading` (`null` for none), `headingSnippet`, `messages`, `class` and `style`. See [Theming](../theming/theming.md) for the four customisation rungs.

## Your own sign-in screens

The page's Bridge client is `getBridge()`, for screens you build yourself:

```ts
import { getBridge, errorMessage, translator } from '@nebulr-group/bridge-svelte';

try {
  const step = await getBridge().signIn.start({ email, password });
  if (!step.done) await step.choose(step.workspaces[0].id);
} catch (error) {
  message = errorMessage(error, translator());
}
```

## Who is signed in

| Store | Value |
|---|---|
| `session` | `{ status: 'loading' }`, `{ status: 'signed-out', reason }` or `{ status: 'signed-in', user, workspace }` |
| `signedIn` | `true` or `false` |
| `user` | `{ id, email, emailVerified }` or `null` |
| `workspace` | `{ id, name, logo, role, standing }` or `null` |
| `workspaces` | the person's workspaces, as `{ value, loading, error }` |
| `me` | the person's profile, as `{ value, loading, error }` |

## Language

The pages ship in 12 languages: Danish, Dutch, English, Finnish, French, German, Italian, Norwegian, Polish, Portuguese, Spanish and Swedish. Set one for the app, and change any wording:

```ts
bridgeBootstrap({
  locale: 'de',
  messages: { 'login.submit': 'Anmelden' },
});
```

A form's own `messages` prop changes wording on that form only.

## What comes later

Email and password, and sign-in links, are the sign-in methods in this alpha. Passkeys, email codes, company sign-in and a second step arrive as new sign-in steps, and the forms show them when your app's sign-in options in Bridge list them.
