<!--
  The signed-in person's sign-in security: their passkeys (add, rename, remove) and their password, which they may remove
  once they have a passkey (TBP-861, TBP-862). The ready-made PasskeyManager, as an app puts it in its own settings.
-->
<script lang="ts">
	import { PasskeyManager } from "@nebulr-group/bridge-svelte";
</script>

<h1>Security</h1>
<PasskeyManager />
