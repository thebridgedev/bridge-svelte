<script lang="ts">
	import { signedIn, user, workspace } from '@nebulr-group/bridge-svelte';
</script>

<h1>Helpdesk</h1>
{#if $signedIn}
	<p data-testid="home-signed-in">Signed in as {$user?.email}, in {$workspace?.name ?? 'your workspace'}.</p>
{:else}
	<p data-testid="home-visitor">A small helpdesk on The Bridge. <a href="/auth/sign-in">Sign in</a> or <a href="/auth/sign-up">sign up</a>.</p>
{/if}
