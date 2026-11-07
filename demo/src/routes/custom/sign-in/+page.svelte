<!-- Rung 3: the app owns the page and its words; Bridge's form sits inside. -->
<script lang="ts">
	import { SignInForm } from '@nebulr-group/bridge-svelte';
</script>

<section class="custom-sign-in" data-testid="custom-sign-in">
	<h1>Welcome back to Helpdesk</h1>
	<p>Sign in to see your tickets.</p>
	<SignInForm heading={null} />
</section>

<style>
	.custom-sign-in {
		max-width: 26rem;
		margin: 2rem auto;
	}
</style>
