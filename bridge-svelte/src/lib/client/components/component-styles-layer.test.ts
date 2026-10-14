/**
 * TBP-814 — the components' own styles sit in the `bridge` cascade layer, still scoped.
 *
 * Each component with a `<style>` block is compiled with `css: 'external'` and its
 * emitted CSS checked: one top-level `@layer bridge` block holds every rule, every
 * selector keeps svelte's scoping class, and text sizes / weights use the same
 * tokens as styles.css. RealtimeDevBadge is a developer overlay and stays as it was.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile, parseCss } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const COMPONENTS = [
	'subscription/BridgeSubscriptionStatus.svelte',
	'subscription/BridgePaywallPage.svelte',
	'subscription/BridgeBillingRoutes.svelte',
	'subscription/BridgeBillingNotice.svelte',
	'subscription/BridgePaywall.svelte',
	'subscription/BridgeQuotaBanner.svelte',
	'sdk-auth/BridgeAuthRoutes.svelte',
];

function compiledCss(file: string) {
	const path = fileURLToPath(new URL(`./${file}`, import.meta.url));
	const { css } = compile(readFileSync(path, 'utf8'), { filename: path, css: 'external', generate: 'client' });
	expect(css, `${file} emitted no CSS`).not.toBeNull();
	return css!.code;
}

type Node = ReturnType<typeof parseCss>['children'][number];

/** Every rule under `nodes` as [selector text, declarations]. */
function rules(code: string, nodes: Node[], out: [string, { property: string; value: string }[]][] = []) {
	for (const node of nodes) {
		if (node.type === 'Rule') {
			const decls = node.block.children.flatMap((c) =>
				c.type === 'Declaration' ? [{ property: c.property, value: c.value }] : [],
			);
			out.push([code.slice(node.prelude.start, node.prelude.end), decls]);
			rules(code, node.block.children.filter((c) => c.type !== 'Declaration') as Node[], out);
		} else if (node.type === 'Atrule' && node.block) {
			rules(code, node.block.children.filter((c) => c.type !== 'Declaration') as Node[], out);
		}
	}
	return out;
}

describe.each(COMPONENTS)('%s — styles in @layer bridge (TBP-814)', (file) => {
	const code = compiledCss(file);
	const sheet = parseCss(code);

	it('emits exactly one top-level block, @layer bridge', () => {
		expect(sheet.children).toHaveLength(1);
		const [layer] = sheet.children;
		expect(layer.type === 'Atrule' && `${layer.name} ${layer.prelude.trim()}`).toBe('layer bridge');
	});

	it('keeps every selector scoped to the component', () => {
		const all = rules(code, sheet.children);
		expect(all.length).toBeGreaterThan(0);
		for (const [selector] of all) {
			// Keyframe steps aren't selectors; everything else carries svelte's hash class.
			if (/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(selector.trim())) continue;
			for (const part of selector.split(',')) {
				expect(part, `${file}: ${part.trim()}`).toMatch(/\.svelte-[a-z0-9]+/);
			}
		}
	});

	it('sizes and weights text from the tokens', () => {
		for (const [selector, decls] of rules(code, sheet.children)) {
			for (const { property, value } of decls) {
				if (property === 'font-size' && value !== 'inherit') {
					expect(value, `${file}: ${selector}`).toMatch(/^calc\([\d.]+ \* var\(--bridge-text-base, 1rem\)\)$/);
				}
				if (property === 'font-weight') {
					expect(value, `${file}: ${selector}`).toMatch(/^var\(--bridge-font-weight-(heading|button|label), \d{3}\)$/);
				}
			}
		}
	});
});

describe('RealtimeDevBadge (developer overlay) is left unlayered', () => {
	it('emits no @layer', () => {
		expect(compiledCss('developer/RealtimeDevBadge.svelte')).not.toContain('@layer');
	});
});
