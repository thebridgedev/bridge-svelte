import { describe, expect, it } from 'vitest';
import { fallBackFromBrowserFont, isBrowserDefaultFont, SYSTEM_FONT_STACK, type FontDocument } from './font.js';

/** A page whose body has `fontFamily` as its computed font, with a head that keeps what is added. */
function page(fontFamily: string) {
	const head: { attributes: Record<string, string>; textContent: string | null; remove(): void }[] = [];
	const body = { fontFamily };
	const doc: FontDocument = {
		body,
		head: {
			querySelector: (selector) => (selector === 'style[data-bridge-font-fallback]' ? (head.find((each) => 'data-bridge-font-fallback' in each.attributes) ?? null) : null),
			prepend: (node) => void head.unshift(node as (typeof head)[number]),
		},
		createElement: () => {
			const element = {
				attributes: {} as Record<string, string>,
				textContent: null as string | null,
				setAttribute(name: string, value: string) {
					element.attributes[name] = value;
				},
				remove() {
					head.splice(head.indexOf(element), 1);
				},
			};
			return element;
		},
		defaultView: { getComputedStyle: () => ({ fontFamily: body.fontFamily }) },
	};
	return { doc, head, body };
}

describe('the font of Bridge on the page', () => {
	it('names the browser default serif in each browser, and nothing an app chose', () => {
		for (const family of ['"Times New Roman"', 'Times', 'serif', '-webkit-standard', '"Times New Roman", serif']) expect(isBrowserDefaultFont(family), family).toBe(true);
		for (const family of ['system-ui, sans-serif', 'Inter, "Times New Roman"', 'Georgia, serif', '"Courier New"', '']) expect(isBrowserDefaultFont(family), family).toBe(false);
	});

	it('a page with no font of its own: the body is in the browser serif, so Bridge gets the system stack, once, in its own layer', () => {
		const { doc, head } = page('"Times New Roman"');
		expect(fallBackFromBrowserFont(doc)).toBe(true);
		expect(fallBackFromBrowserFont(doc)).toBe(true);
		expect(head).toHaveLength(1);
		expect(head[0].textContent).toBe(`@layer bridge { :where(:root) { --bridge-font-family: ${SYSTEM_FONT_STACK}; } }`);
	});

	it('an app with its own font: nothing is set, so Bridge inherits it; a font that arrives later takes the stack away again', () => {
		const styled = page('Inter, sans-serif');
		expect(fallBackFromBrowserFont(styled.doc)).toBe(false);
		expect(styled.head).toHaveLength(0);

		const later = page('Times');
		expect(fallBackFromBrowserFont(later.doc)).toBe(true);
		later.body.fontFamily = 'Inter, sans-serif';
		expect(fallBackFromBrowserFont(later.doc)).toBe(false);
		expect(later.head).toHaveLength(0);
	});

	it('does nothing where there is no page', () => {
		expect(fallBackFromBrowserFont(undefined)).toBe(false);
	});
});
