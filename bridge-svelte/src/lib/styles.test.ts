/**
 * TBP-814 — the default stylesheet follows the app's type and loses to the app's CSS.
 *
 * Static checks on `styles.css` (parsed with svelte's own CSS parser):
 *   - the layer order statement comes first, `bridge` last after Tailwind v4's layers;
 *   - `--bridge-text-base` is registered with `@property`, outside any layer;
 *   - every rule after that sits inside one `@layer bridge` block;
 *   - no text size is a fixed `rem` any more, and no weight is hard-coded except
 *     the two avatar initials;
 *   - the token fallbacks are the values the rules had before, so an app that sets
 *     nothing sees no change.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCss } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
const sheet = parseCss(source);

type Node = (typeof sheet.children)[number];
type Decl = { selector: string; property: string; value: string };

/** Every declaration under `node`, with the selector of the rule that holds it. */
function declarations(nodes: Node[], out: Decl[] = []): Decl[] {
	for (const node of nodes) {
		if (node.type === 'Rule') {
			const selector = source.slice(node.prelude.start, node.prelude.end).replace(/\s+/g, ' ').trim();
			for (const child of node.block.children) {
				if (child.type === 'Declaration') out.push({ selector, property: child.property, value: child.value });
			}
			declarations(node.block.children.filter((c) => c.type !== 'Declaration') as Node[], out);
		} else if (node.type === 'Atrule' && node.block) {
			declarations(node.block.children.filter((c) => c.type !== 'Declaration') as Node[], out);
		}
	}
	return out;
}

const all = declarations(sheet.children);
const valueOf = (selector: string, property: string) =>
	all.find((d) => d.selector.split(',').map((s) => s.trim()).includes(selector) && d.property === property)?.value;

describe('styles.css — cascade layer (TBP-814)', () => {
	it('opens with the layer order statement, bridge after Tailwind v4’s layers', () => {
		const first = sheet.children[0];
		expect(first.type).toBe('Atrule');
		if (first.type !== 'Atrule') return;
		expect(first.name).toBe('layer');
		expect(first.block).toBeNull();
		expect(first.prelude.split(',').map((s) => s.trim())).toEqual([
			'theme',
			'base',
			'components',
			'utilities',
			'bridge',
		]);
	});

	it('registers --bridge-text-base with @property, outside the layer', () => {
		const second = sheet.children[1];
		expect(second.type === 'Atrule' && second.name).toBe('property');
		if (second.type !== 'Atrule' || !second.block) return;
		expect(second.prelude.trim()).toBe('--bridge-text-base');
		const descriptors = Object.fromEntries(
			second.block.children.map((c) => (c.type === 'Declaration' ? [c.property, c.value] : ['', ''])),
		);
		expect(descriptors).toMatchObject({ syntax: "'<length>'", inherits: 'true', 'initial-value': '16px' });
	});

	it('puts everything after the @property inside a single @layer bridge block', () => {
		expect(sheet.children).toHaveLength(3);
		const layer = sheet.children[2];
		expect(layer.type === 'Atrule' && layer.name).toBe('layer');
		if (layer.type !== 'Atrule') return;
		expect(layer.prelude.trim()).toBe('bridge');
		expect(layer.block?.children.length).toBeGreaterThan(100);
		// Nothing else on the page is unlayered: the only top-level rules are the three above.
		expect(sheet.children.filter((n) => n.type === 'Rule')).toHaveLength(0);
	});

	it('derives the base text size from the app’s <body>', () => {
		expect(valueOf(':where(body)', '--bridge-text-base')).toBe('var(--bridge-font-size, 1em)');
	});
});

describe('styles.css — type follows the app (TBP-814)', () => {
	it('has no fixed rem font sizes left', () => {
		const fixed = all.filter((d) => d.property === 'font-size' && /^[\d.]+rem$/.test(d.value.trim()));
		expect(fixed).toEqual([]);
	});

	it('scales every relative font size from --bridge-text-base with a 1rem fallback', () => {
		const sizes = all.filter((d) => d.property === 'font-size' && d.value !== 'inherit');
		expect(sizes.length).toBeGreaterThan(50);
		for (const d of sizes) {
			expect(d.value, d.selector).toMatch(/^calc\([\d.]+ \* var\(--bridge-text-base, 1rem\)\)$/);
		}
	});

	it('hard-codes no font-weight except the two avatar initials', () => {
		const literal = all.filter((d) => d.property === 'font-weight' && !d.value.startsWith('var('));
		expect(literal.map((d) => d.selector).sort()).toEqual(['.bridge-tenant-avatar', '[data-bridge-workspace-avatar]']);
		for (const d of all.filter((d) => d.property === 'font-weight' && d.value.startsWith('var('))) {
			expect(d.value, d.selector).toMatch(/^var\(--bridge-font-weight-(heading|button|label), \d{3}\)$/);
		}
	});

	it('keeps the previous values as the token fallbacks', () => {
		// Pre-TBP-814: `.bridge-btn { font-size: 0.875rem; font-weight: 500 }`.
		expect(valueOf('.bridge-btn', 'font-size')).toBe('calc(0.875 * var(--bridge-text-base, 1rem))');
		expect(valueOf('.bridge-btn', 'font-weight')).toBe('var(--bridge-font-weight-button, 500)');
		// Pre-TBP-814: `.bridge-plan-price-amount { font-size: 1.9rem; font-weight: 700 }`.
		expect(valueOf('.bridge-plan-price-amount', 'font-size')).toBe('calc(1.9 * var(--bridge-text-base, 1rem))');
		expect(valueOf('.bridge-plan-price-amount', 'font-weight')).toBe('var(--bridge-font-weight-heading, 700)');
	});

	it('gives every button a shadow token that defaults to none', () => {
		for (const selector of ['.bridge-btn', '.bridge-btn-primary', '.bridge-btn-secondary', '.bridge-btn-danger']) {
			expect(valueOf(selector, 'box-shadow'), selector).toBe('var(--bridge-button-shadow, none)');
		}
	});

	it('lets --bridge-card-shadow style the plan-change dialog, defaulting to its old shadow', () => {
		const dialogShadows = all.filter(
			(d) => d.property === 'box-shadow' && d.value === 'var(--bridge-card-shadow, 0 24px 60px -12px rgba(0, 0, 0, 0.35))',
		);
		expect(dialogShadows).toHaveLength(1);
	});
});
