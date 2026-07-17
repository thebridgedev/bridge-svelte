<script lang="ts">
	import type { Snippet } from 'svelte';
	import { inlineMd, type PropRow } from '$lib/learning';

	type CodeTab = { label: string; code: string; lang?: string };
	type RelatedLink = { label: string; href: string };

	let {
		title,
		breadcrumb = '',
		oneLiner = '',
		introHtml = '',
		codeTabs = [],
		props = null,
		underTheHoodHtml = '',
		related = [],
		live
	}: {
		title: string;
		breadcrumb?: string;
		oneLiner?: string;
		introHtml?: string;
		codeTabs?: CodeTab[];
		props?: PropRow[] | null;
		underTheHoodHtml?: string;
		related?: RelatedLink[];
		live?: Snippet;
	} = $props();

	let activeTab = $state(0);
	let copied = $state(false);

	async function copyActive() {
		try {
			await navigator.clipboard.writeText(codeTabs[activeTab]?.code ?? '');
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch {
			/* clipboard unavailable */
		}
	}
</script>

<article class="fp">
	<header class="fp-head">
		{#if breadcrumb}<div class="fp-crumb">{breadcrumb}</div>{/if}
		<h1 class="fp-title">{title}</h1>
		{#if oneLiner}<p class="fp-oneliner">{oneLiner}</p>{/if}
		{#if introHtml}<div class="fp-intro">{@html introHtml}</div>{/if}
	</header>

	<div class="fp-grid">
		<!-- LIVE -->
		<section class="fp-panel fp-live">
			<div class="fp-panel-bar">
				<span class="fp-dot"></span>
				<span class="fp-panel-label">Live</span>
			</div>
			<div class="fp-panel-body">
				{#if live}{@render live()}{/if}
			</div>
		</section>

		<!-- CODE -->
		{#if codeTabs.length}
			<section class="fp-panel fp-code">
				<div class="fp-code-bar">
					<div class="fp-tabs">
						{#each codeTabs as tab, i (tab.label)}
							<button
								class="fp-tab"
								class:active={i === activeTab}
								onclick={() => (activeTab = i)}>{tab.label}</button
							>
						{/each}
					</div>
					{#if codeTabs[activeTab]?.lang}<span class="fp-lang">{codeTabs[activeTab].lang}</span>{/if}
					<button class="fp-copy" onclick={copyActive}>{copied ? 'Copied' : 'Copy'}</button>
				</div>
				<pre class="fp-pre"><code>{codeTabs[activeTab]?.code ?? ''}</code></pre>
			</section>
		{/if}
	</div>

	{#if props?.length}
		<h2 class="fp-h2"><span class="fp-h2-dot"></span>Props &amp; options</h2>
		<div class="fp-props">
			{#each props as p, i (i)}
				<div class="fp-prop-row">
					<span class="fp-prop-name">{@html inlineMd(p.name)}</span>
					<span class="fp-prop-type">{@html inlineMd(p.type)}</span>
					<span class="fp-prop-desc">{@html inlineMd(p.description)}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if underTheHoodHtml}
		<h2 class="fp-h2"><span class="fp-h2-dot fp-h2-dot--live"></span>Under the hood</h2>
		<div class="fp-hood">{@html underTheHoodHtml}</div>
	{/if}

	{#if related.length}
		<div class="fp-related">
			<span class="fp-related-label">Related</span>
			{#each related as r (r.href)}
				<a class="fp-chip" href={r.href}>{r.label}</a>
			{/each}
		</div>
	{/if}
</article>

<style>
	/* Token-based: Phase 2's shell overrides these custom properties for dark mode.
	   Light fallbacks keep the page readable inside the current layout. */
	.fp {
		--fp-surface: var(--surface, #ffffff);
		--fp-surface-2: var(--surface-2, #f4f6f9);
		--fp-border: var(--border, #e5e9f0);
		--fp-border-2: var(--border-2, #d8dee7);
		--fp-text: var(--text, #0d1320);
		--fp-muted: var(--text-muted, #586273);
		--fp-faint: var(--text-faint, #8b95a4);
		--fp-primary: var(--primary, #2f5be0);
		--fp-live: var(--live, #0c9b73);
		--fp-code-bg: var(--code-bg, #0b1019);
		--fp-radius: 12px;

		max-width: 920px;
		margin: 0 auto;
		padding: 40px 24px 96px;
		color: var(--fp-text);
		font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	.fp-crumb {
		font: 550 11.5px ui-monospace, 'JetBrains Mono', monospace;
		color: var(--fp-faint);
	}
	.fp-title {
		font-size: 27px;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 10px 0 0;
	}
	.fp-oneliner {
		font-size: 15px;
		line-height: 1.6;
		color: var(--fp-muted);
		max-width: 64ch;
		margin: 12px 0 0;
	}
	.fp-intro {
		font-size: 14px;
		line-height: 1.65;
		color: var(--fp-muted);
		max-width: 70ch;
		margin: 14px 0 0;
	}
	.fp-intro :global(code),
	.fp-prop-name :global(code),
	.fp-prop-type :global(code),
	.fp-hood :global(code) {
		font-family: ui-monospace, 'JetBrains Mono', monospace;
		font-size: 0.86em;
		background: var(--fp-surface-2);
		border: 1px solid var(--fp-border);
		padding: 1px 5px;
		border-radius: 5px;
	}

	.fp-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 24px;
		align-items: start;
	}

	.fp-panel {
		border: 1px solid var(--fp-border);
		border-radius: 13px;
		overflow: hidden;
		background: var(--fp-surface);
	}
	.fp-panel-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 14px;
		border-bottom: 1px solid var(--fp-border);
		background: var(--fp-surface-2);
	}
	.fp-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--fp-live);
	}
	.fp-panel-label {
		font: 600 10.5px ui-monospace, 'JetBrains Mono', monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--fp-faint);
	}
	.fp-panel-body {
		padding: 18px;
	}

	.fp-code {
		background: var(--fp-code-bg);
		border-color: var(--fp-border);
	}
	.fp-code-bar {
		display: flex;
		align-items: center;
		height: 38px;
		padding: 0 6px 0 8px;
		border-bottom: 1px solid #1b2333;
		background: #0e1420;
	}
	.fp-tabs {
		display: flex;
	}
	.fp-tab {
		position: relative;
		height: 38px;
		padding: 0 12px;
		background: none;
		border: none;
		color: #cdd6e3;
		font: 600 12px Inter, sans-serif;
		cursor: pointer;
	}
	.fp-tab.active::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: 0;
		height: 2px;
		background: var(--fp-primary);
		border-radius: 2px;
	}
	.fp-lang {
		margin-left: auto;
		font: 550 10px ui-monospace, 'JetBrains Mono', monospace;
		color: #566071;
		padding-right: 8px;
	}
	.fp-copy {
		font: 600 11px ui-monospace, 'JetBrains Mono', monospace;
		color: #8893a4;
		background: none;
		border: 1px solid #232c3d;
		border-radius: 6px;
		padding: 4px 9px;
		cursor: pointer;
		margin-right: 4px;
	}
	.fp-copy:hover {
		color: #cdd6e3;
	}
	.fp-pre {
		margin: 0;
		padding: 16px;
		overflow: auto;
		font: 450 12.5px/1.7 ui-monospace, 'JetBrains Mono', monospace;
		color: #a9b1d6;
	}

	.fp-h2 {
		font-size: 14px;
		font-weight: 600;
		margin: 34px 0 12px;
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.fp-h2-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--fp-primary);
	}
	.fp-h2-dot--live {
		background: var(--fp-live);
	}

	.fp-props {
		border: 1px solid var(--fp-border);
		border-radius: var(--fp-radius);
		overflow: hidden;
		background: var(--fp-surface);
	}
	.fp-prop-row {
		display: grid;
		grid-template-columns: 200px 150px 1fr;
		gap: 14px;
		padding: 11px 16px;
		align-items: baseline;
	}
	.fp-prop-row + .fp-prop-row {
		border-top: 1px solid var(--fp-border);
	}
	.fp-prop-name {
		font: 600 12.5px ui-monospace, 'JetBrains Mono', monospace;
		color: var(--fp-text);
	}
	.fp-prop-type {
		font: 500 11.5px ui-monospace, 'JetBrains Mono', monospace;
		color: var(--fp-primary);
	}
	.fp-prop-desc {
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--fp-muted);
	}

	.fp-hood {
		border: 1px solid var(--fp-border);
		border-radius: var(--fp-radius);
		background: var(--fp-surface);
		padding: 14px 18px;
		font-size: 13px;
		line-height: 1.7;
		color: var(--fp-muted);
	}
	.fp-hood :global(ul) {
		margin: 0;
		padding-left: 18px;
	}
	.fp-hood :global(li) {
		margin: 4px 0;
	}

	.fp-related {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 26px;
		align-items: center;
	}
	.fp-related-label {
		font: 600 10px ui-monospace, 'JetBrains Mono', monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--fp-faint);
		margin-right: 4px;
	}
	.fp-chip {
		height: 28px;
		display: inline-flex;
		align-items: center;
		padding: 0 12px;
		border-radius: 7px;
		background: var(--fp-surface);
		border: 1px solid var(--fp-border-2);
		color: var(--fp-text);
		font: 550 12px Inter, sans-serif;
		text-decoration: none;
	}
	.fp-chip:hover {
		border-color: var(--fp-primary);
	}

	@media (max-width: 820px) {
		.fp-grid {
			grid-template-columns: 1fr;
		}
		.fp-prop-row {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
