---
title: Logging in and logging out
description: How Bridge's JWT-based session works, and how to log a user out.
sidebar:
  label: Svelte
---

# Logging in and logging out

Bridge auth is **JWT-based**. Signing in gets the browser a token set (`accessToken`, `refreshToken`, `idToken`), stored in `localStorage`. Everything else (staying signed in across reloads, staying signed in across tabs, silently refreshing before expiry) follows from that one fact.

## How logging in works

On every app load, the SDK looks in `localStorage` for a stored token. That check is what decides whether the user sees the app or the login flow:

- **A token is there**: the app starts as authenticated immediately (no round-trip to check it first), then quietly schedules a refresh in the background if the token is close to expiring, so it's valid again before you'd ever notice. This is why reloading the page doesn't bounce a signed-in user back to the login page.
- **No token is there**: `authState` starts at `'unauthenticated'` and the login flow takes over, whichever sign-in methods you've enabled (e.g. [email & password](/auth/sign-in/email-password/) or [magic link](/auth/sign-in/magic-link/); see the [Authentication overview](/auth/) for all of them, and [Auth states](/auth/user-token/auth-states/) for the states the flow moves through).

If a refresh ever fails (the refresh token itself has expired or been revoked), Bridge clears the stored token and drops the user back to `'unauthenticated'`, the same as an explicit logout.

## Logging out

Logging out is just erasing the stored token. There's no server-side session to invalidate first, since JWTs aren't revocable server-side the way a session cookie is:

```svelte
<script lang="ts">
  import { getBridgeAuth } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  async function handleLogout() {
    await getBridgeAuth().logout({ redirectTo: '/' });
  }
</script>

<button onclick={handleLogout}>Log out</button>
```

`logout()` clears the token from `localStorage`, flips `authState` back to `'unauthenticated'`, and then redirects the browser:

- **With `redirectTo`**: the browser goes straight there (an in-app route, like the example above, or any URL of your choosing).
- **Without it**: the browser is sent to Bridge's hosted login page instead, so the user lands somewhere sensible rather than on a blank logged-out app.
