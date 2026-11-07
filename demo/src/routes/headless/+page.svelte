<!-- Rung 4: no Bridge components at all, only the client. -->
<script lang="ts">
	import { getBridge, errorMessage, translator, session } from '@nebulr-group/bridge-svelte';

	let email = $state('');
	let password = $state('');
	let message = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = null;
		try {
			const step = await getBridge().signIn.start({ email, password });
			if (!step.done) await step.choose(step.workspaces[0].id);
		} catch (error) {
			message = errorMessage(error, translator());
		}
	}
</script>

<h1>Headless sign-in</h1>
{#if $session.status === 'signed-in'}
	<p data-testid="headless-done">Signed in as {$session.user.email}.</p>
{:else}
	<form onsubmit={submit} data-testid="headless-form">
		<input type="email" name="email" placeholder="Email" bind:value={email} />
		<input type="password" name="password" placeholder="Password" bind:value={password} />
		<button type="submit">Go</button>
	</form>
	{#if message}<p role="alert" data-testid="headless-error">{message}</p>{/if}
{/if}
