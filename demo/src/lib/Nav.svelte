<script lang="ts">
	import { FeatureFlag, ProfileName, SignOutButton, signedIn, workspace } from '@nebulr-group/bridge-svelte';
</script>

<nav class="nav" data-testid="nav">
	<a href="/" class="nav-brand">Bridge Demo</a>
	<a href="/tickets" class="nav-link">Tickets</a>
	<FeatureFlag key="reports">
		<a href="/reports" class="nav-link" data-testid="nav-reports">Reports</a>
	</FeatureFlag>
	<a href="/settings/team" class="nav-link">Team</a>
	<a href="/subscription" class="nav-link">Subscription</a>
	<span class="nav-spacer"></span>
	{#if $signedIn}
		<a href="/auth/workspaces" class="nav-link" data-testid="nav-workspace">{$workspace?.name ?? 'Workspace'}</a>
		<ProfileName class="nav-email" data-testid="nav-user" />
		<SignOutButton class="nav-button" data-testid="sign-out" />
	{:else}
		<a href="/auth/sign-in" class="nav-link" data-testid="nav-sign-in">Sign in</a>
	{/if}
</nav>

<style>
	.nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid var(--app-border);
		background: var(--app-surface);
	}
	.nav-brand {
		font-weight: 700;
		color: var(--app-accent);
		text-decoration: none;
	}
	.nav-link {
		color: inherit;
		text-decoration: none;
	}
	.nav-spacer {
		flex: 1;
	}
	:global(.nav-email) {
		color: var(--app-muted);
		font-size: 0.875rem;
	}
	:global(.nav-button) {
		font: inherit;
		padding: 0.35rem 0.75rem;
		border: 1px solid var(--app-border);
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
	}
</style>
