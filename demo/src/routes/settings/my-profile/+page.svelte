<!--
  The ready-made My profile page: Details (names, the app's own fields, the
  person's own language), Email (change it, confirmed in both inboxes) and
  Security settings. `?names=0` shows it for an app that collects no names.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { MyProfile } from '@nebulr-group/bridge-svelte';

	const names = $derived(page.url.searchParams.get('names') !== '0');
</script>

<MyProfile {names} data-testid="my-profile" />
