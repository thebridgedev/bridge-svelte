/**
 * The browser build of `@nebulr-group/bridge-svelte/server`: it throws on
 * import, so a page that imports the server helpers fails loudly at build
 * or load time instead of shipping the app key to a browser.
 */
throw new Error(
	'[bridge] @nebulr-group/bridge-svelte/server runs on your server only. Import it from hooks.server.ts, +server.ts or +page.server.ts, never from a page or +page.ts.',
);

export {};
