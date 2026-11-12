<!--
  An action that wants a recent sign-in. `withRecheck` runs it; when Bridge
  says the sign-in is too old, the "confirm it is you" dialog opens over this
  page (the note below stays as typed) and the save is tried once more.
-->
<script lang="ts">
	import { getBridge, isBridgeError, withRecheck } from '@nebulr-group/bridge-svelte';

	let name = $state('');
	let note = $state('');
	let result = $state<string | null>(null);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		result = null;
		try {
			await withRecheck(() => getBridge().me.update({ firstName: name }));
			result = 'Saved.';
		} catch (error) {
			result = isBridgeError(error, 'cancelled') ? 'Not saved: not confirmed.' : `Not saved: ${isBridgeError(error) ? error.kind : 'error'}`;
		}
	}
</script>

<h1>Profile</h1>
<form onsubmit={save}>
	<p>
		<label for="profile-name">First name</label>
		<input id="profile-name" data-testid="profile-name" bind:value={name} required />
	</p>
	<p>
		<label for="profile-note">A note, to show the page stays as it was</label>
		<textarea id="profile-note" data-testid="profile-note" bind:value={note}></textarea>
	</p>
	<button type="submit" class="bridge-btn bridge-btn-primary" data-testid="profile-save">Save</button>
</form>
{#if result}<p data-testid="profile-result">{result}</p>{/if}
