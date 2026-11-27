<!--
  Security settings: the person's passkeys and their connected tools (AI
  assistants and command-line tools signed in to their account), each a
  ready-made section.
-->
<script lang="ts">
	import { ConnectedTools, PasskeyManager } from '@nebulr-group/bridge-svelte';
</script>

<h1>Security</h1>
<PasskeyManager />
<ConnectedTools />
