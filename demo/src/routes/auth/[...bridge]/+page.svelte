<!--
  TBP-696 — every auth page from this one file: signup, oauth-callback,
  set-password/[token], forgot-password, magic-link, setup-passkey/[token] and
  workspaces. Exactly what the guides tell an app to write.

  /auth/login is NOT served from here: the demo has its own
  `auth/login/+page.svelte`, and SvelteKit prefers the specific route over this
  catch-all. That is the "take over one page" rung, and the e2e suite proves the
  other pages keep working while it is in place.
-->
<script lang="ts">
  import { BridgeAuthRoutes } from '@bridge-svelte/lib/index';
</script>

<BridgeAuthRoutes />
