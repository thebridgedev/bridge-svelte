<!--
  The signed-in person's sign-in security: their passkeys (add, rename, remove) and their password, which they may remove
  once they have a passkey (TBP-861, TBP-862), and their connected tools: AI assistants and command-line tools signed
  in to their account (TBP-854). The ready-made PasskeyManager and ConnectedTools, as an app puts them in its own settings.
-->
<script lang="ts">
	import { ConnectedTools, PasskeyManager } from "@nebulr-group/bridge-svelte";
</script>

<h1>Security</h1>
<PasskeyManager />
<ConnectedTools />
