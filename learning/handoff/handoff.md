# Hand-off mode

Hand-off mode turns a sign-in page into one that signs a person in for a program on their own machine, such as a command-line tool, instead of for itself.

1. The program makes a PKCE verifier and challenge, listens on a loopback port, and opens the page:
   `https://app.example.com/auth/handoff?code_challenge=…&code_challenge_method=S256&redirect_uri=http://127.0.0.1:53123/callback&state=…`
2. The person signs in there (and picks a workspace if they have several).
3. The page sends the browser to `http://127.0.0.1:53123/callback?code=…&state=…`.
4. The program checks `state` and trades the code for tokens with its own verifier.

Only the program holds the verifier, so only it can use the code. The page never trades the code, never receives a token, and its own session is not touched.

## Turning it on

It is off unless you turn it on:

```ts
bridgeBootstrap({
  handoff: { loopback: true, program: 'the Acme CLI' },
});
```

`<BridgeAuthRoutes>` then serves `/auth/handoff`. The page names the program in its heading and its "you can close this tab" message. `<HandoffSignIn>` is the same page as a component.

## Where the code may go

The return address must be `http://127.0.0.1:<port>/…` or `http://[::1]:<port>/…`, with no user name and no fragment. `localhost`, any other host, and `https` are refused, so a crafted link cannot send a code off the person's machine. A request that fails these checks, or has no S256 challenge or a short `state`, shows "This sign-in link is not valid" and signs nobody in.

## Building your own hand-off page

```ts
import { getBridge, readHandoff, handoffSignIn, returnToProgram } from '@nebulr-group/bridge-svelte';

const request = readHandoff(location.search);           // 'ready' or 'invalid'
if (request.status === 'ready') {
  let step = await handoffSignIn(getBridge(), request.request, { email, password });
  if (step.status === 'workspace') step = await step.choose(step.workspaces[0].id);
  if (step.status === 'done') returnToProgram(step);
}
```
