<script lang="ts">
	import FeatureFlag from '@bridge-svelte/lib/flags/FeatureFlag.svelte';
	import FeaturePage from '$lib/components/FeaturePage.svelte';
	import { getDoc, section } from '$lib/learning';

	let plan = $state<'enterprise' | 'pro' | 'free'>('enterprise');

	// Content comes from the single source of truth: bridge-svelte/learning/feature-flags.
	// The same markdown the public docs hub renders — never hard-coded here.
	const doc = getDoc('feature-flags');
	const usage = section(doc, 'FeatureFlag component');
	const ctx = section(doc, 'Per-call context');
	const hood = section(doc, 'Under the hood');

	const codeTabs = [
		usage?.code[0] && { label: 'Usage', code: usage.code[0].code, lang: 'svelte' },
		ctx?.code[0] && { label: 'Context', code: ctx.code[0].code, lang: 'ts' }
	].filter(Boolean) as { label: string; code: string; lang: string }[];

	// Map related doc slugs to demo routes where one exists.
	const relatedRoutes: Record<string, { label: string; href: string }> = {
		'live-updates': { label: 'Live updates', href: '/billing-lifecycle' },
		payments: { label: 'Subscriptions', href: '/subscription' }
	};
	const related = (doc?.frontmatter.related ?? [])
		.map((s) => relatedRoutes[s])
		.filter(Boolean) as { label: string; href: string }[];
</script>

<FeaturePage
	title="Feature Flags"
	breadcrumb="Feature Flags / Patterns"
	oneLiner={doc?.frontmatter.oneLiner ?? ''}
	introHtml={doc?.introHtml ?? ''}
	{codeTabs}
	props={usage?.props ?? null}
	underTheHoodHtml={hood?.html ?? ''}
	{related}
>
	{#snippet live()}
		<div class="ff-demo">
			<!-- A: Simple on/off -->
			<div class="ff-row">
				<span class="ff-key">A</span>
				<span class="ff-name">Simple on/off</span>
			</div>
			<FeatureFlag key="simple-flag" defaultValue={false}>
				{#snippet children(_value)}
					<div class="ff-result ff-result--on" data-testid="simple-flag-on">
						✅ <strong>simple-flag</strong> is <strong>ON</strong>
					</div>
				{/snippet}
				{#snippet fallback(_value)}
					<div class="ff-result ff-result--off" data-testid="simple-flag-off">
						⬜ <strong>simple-flag</strong> is <strong>OFF</strong> — enable it in admin
					</div>
				{/snippet}
			</FeatureFlag>

			<div class="ff-divider"></div>

			<!-- B: Rule-based -->
			<div class="ff-row">
				<span class="ff-key">B</span>
				<span class="ff-name">Rule-based · <code>user.role</code></span>
			</div>
			<FeatureFlag key="role-flag" defaultValue={false}>
				{#snippet children(_value)}
					<div class="ff-result ff-result--on" data-testid="role-flag-on">
						✅ <strong>role-flag</strong> matched — your role satisfies the rule
					</div>
				{/snippet}
				{#snippet fallback(_value)}
					<div class="ff-result ff-result--off" data-testid="role-flag-off">
						⬜ <strong>role-flag</strong> did not match — add a role rule in admin
					</div>
				{/snippet}
			</FeatureFlag>

			<div class="ff-divider"></div>

			<!-- C: Client-supplied context -->
			<div class="ff-row">
				<span class="ff-key">C</span>
				<span class="ff-name">Client context · <code>plan</code></span>
			</div>
			<label class="ff-control">
				<span>Send <code>plan</code>:</span>
				<select bind:value={plan} data-testid="plan-select">
					<option value="enterprise">enterprise</option>
					<option value="pro">pro</option>
					<option value="free">free</option>
				</select>
			</label>
			<FeatureFlag key="plan-flag" defaultValue={false} context={{ attributes: { plan } }}>
				{#snippet children(_value)}
					<div class="ff-result ff-result--on" data-testid="plan-flag-on">
						✅ <strong>plan-flag</strong> matched — <code>plan = {plan}</code>
					</div>
				{/snippet}
				{#snippet fallback(_value)}
					<div class="ff-result ff-result--off" data-testid="plan-flag-off">
						⬜ <strong>plan-flag</strong> did not match for <code>plan = {plan}</code>
					</div>
				{/snippet}
			</FeatureFlag>
		</div>
	{/snippet}
</FeaturePage>

<style>
	.ff-demo {
		display: flex;
		flex-direction: column;
		gap: 11px;
	}
	.ff-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ff-key {
		font: 700 11px ui-monospace, 'JetBrains Mono', monospace;
		color: var(--text-faint, #8b95a4);
	}
	.ff-name {
		font-size: 13px;
		font-weight: 600;
		color: var(--text, #0d1320);
	}
	.ff-name code {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--text-muted, #586273);
	}
	.ff-divider {
		height: 1px;
		background: var(--border, #e5e9f0);
		margin: 7px 0;
	}
	.ff-control {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12.5px;
		color: var(--text-muted, #586273);
	}
	.ff-control select {
		padding: 5px 8px;
		border: 1px solid var(--border-2, #d8dee7);
		border-radius: 7px;
		background: var(--surface, #fff);
		color: var(--text, #0d1320);
		font: 600 12px ui-monospace, 'JetBrains Mono', monospace;
	}
	.ff-result {
		padding: 12px 14px;
		border-radius: 9px;
		font-size: 12.5px;
	}
	.ff-result--on {
		background: var(--live-soft, rgba(12, 155, 115, 0.12));
		border: 1px solid var(--live, #0c9b73);
		color: var(--live, #0c9b73);
	}
	.ff-result--off {
		background: var(--surface-2, #f4f6f9);
		border: 1px solid var(--border, #e5e9f0);
		color: var(--text-muted, #586273);
	}
	.ff-result code {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 0.9em;
	}
</style>
