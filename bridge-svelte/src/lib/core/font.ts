/**
 * The font of Bridge's pages and components. They inherit the app's font
 * (`font-family: var(--bridge-font-family, inherit)`), so an app with a font of
 * its own always sees it. Only a page whose body is still in the browser's
 * default serif gets a system font stack, so an app with no font of its own
 * never shows Bridge in Times.
 */

/** What Bridge uses on a page that has no font of its own. */
export const SYSTEM_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** The names browsers give their default font: Chrome and Safari say Times New Roman or Times, Firefox serif. */
const BROWSER_DEFAULTS = new Set(['times new roman', 'times', 'serif', '-webkit-standard']);

/** Marks the style element Bridge adds, so it is added once and taken away again. */
const MARK = 'data-bridge-font-fallback';

/** Whether a computed `font-family` is the browser's default: every family in it is a default serif. */
export function isBrowserDefaultFont(fontFamily: string): boolean {
	const families = fontFamily
		.split(',')
		.map((family) => family.trim().replace(/^["']|["']$/g, '').toLowerCase())
		.filter((family) => family !== '');
	return families.length > 0 && families.every((family) => BROWSER_DEFAULTS.has(family));
}

/** The parts of a document the check reads and writes. */
export interface FontDocument {
	readonly body: unknown;
	readonly head: { querySelector(selector: string): { remove(): void } | null; prepend(node: unknown): void } | null;
	createElement(tag: 'style'): { setAttribute(name: string, value: string): void; textContent: string | null };
	readonly defaultView: { getComputedStyle(element: never): { fontFamily: string } } | null;
}

/**
 * Sets `--bridge-font-family` to the system stack when the page's body is in
 * the browser's default font, and takes it away once the body has a font.
 * The value sits in Bridge's own cascade layer with no specificity, so a value
 * the app sets wins. Returns whether the system stack is in place.
 */
export function fallBackFromBrowserFont(doc: FontDocument | undefined = globalThis.document as unknown as FontDocument | undefined): boolean {
	if (doc === undefined || doc.body === null || doc.body === undefined || doc.head === null || doc.defaultView === null) return false;
	const browserDefault = isBrowserDefaultFont(doc.defaultView.getComputedStyle(doc.body as never).fontFamily);
	const added = doc.head.querySelector(`style[${MARK}]`);
	if (!browserDefault) {
		added?.remove();
		return false;
	}
	if (added !== null) return true;
	const style = doc.createElement('style');
	style.setAttribute(MARK, '');
	style.textContent = `@layer bridge { :where(:root) { --bridge-font-family: ${SYSTEM_FONT_STACK}; } }`;
	// First in the head: if it comes before Bridge's stylesheet, it does not move Bridge's layer above the app's layers.
	doc.head.prepend(style);
	return true;
}
