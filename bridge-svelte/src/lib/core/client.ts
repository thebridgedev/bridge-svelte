/**
 * The page's Bridge client. bridgeBootstrap makes one per page, in the
 * browser, and every store and component reads it from here. Nothing is made
 * on a server: the server side has its own helpers (`/server`), per request.
 */
import { createBridge, localStorageAdapter, memoryStorage, type Bridge, type BridgeOptions, type SignedOutReason } from '@nebulr-group/bridge-auth-core';
import { get, writable, type Readable } from 'svelte/store';
import type { ResolvedConfig } from './config.js';
import { setAppCopy } from './i18n.js';

const clientStore = writable<Bridge | null>(null);
const configStore = writable<ResolvedConfig | null>(null);

/** The client, once bridgeBootstrap has made it; null before. */
export const bridgeClient: Readable<Bridge | null> = { subscribe: clientStore.subscribe };
/** The resolved settings, once bridgeBootstrap has run; null before. */
export const bridgeConfig: Readable<ResolvedConfig | null> = { subscribe: configStore.subscribe };

/** Why the last session ended, for the sign-in page to say so once. */
let lastEnded: SignedOutReason | null = null;

/**
 * The page's Bridge client, for anything the components do not cover:
 * `getBridge().me.get()`, `getBridge().fetch(...)`. Throws before
 * bridgeBootstrap has run.
 */
export function getBridge(): Bridge {
	const client = get(clientStore);
	if (client === null) {
		throw new Error('[bridge] No Bridge client yet. Add `export const load = bridgeBootstrap({ ... })` to your root +layout.ts.');
	}
	return client;
}

/** The resolved settings. Throws before bridgeBootstrap has run. */
export function getConfig(): ResolvedConfig {
	const config = get(configStore);
	if (config === null) throw new Error('[bridge] bridgeBootstrap has not run yet.');
	return config;
}

/** The settings, or null before bridgeBootstrap: for components that render before it. */
export function peekConfig(): ResolvedConfig | null {
	return get(configStore);
}

/** Takes the reason the last session ended, once. */
export function takeEndedReason(): SignedOutReason | null {
	const reason = lastEnded;
	lastEnded = null;
	return reason;
}

/**
 * Makes the page's client, or returns the one already made for the same
 * issuer and storage. A new issuer or storage replaces it.
 */
export function startClient(config: ResolvedConfig, extra?: Partial<BridgeOptions>): Bridge {
	const current = get(clientStore);
	const previous = get(configStore);
	setAppCopy(config.locale, config.messages);
	configStore.set(config);
	if (current !== null && previous?.issuer === config.issuer && previous.storage === config.storage) return current;
	current?.destroy();
	const client = createBridge({
		issuer: config.issuer,
		tokenOrigins: config.tokenOrigins,
		...(config.live ? {} : { live: false as const }),
		// Memory: the refresh token and the visitor id stay in this page. A sign-up's verifier waits in localStorage
		// for its email link, which opens in a new tab, for the link's 15 minutes at most, and is removed once used.
		...(config.storage === 'memory' ? { storage: memoryStorage(), signUpStorage: localStorageAdapter() } : {}),
		...extra,
	});
	client.on('signed-out', ({ reason }) => {
		if (reason === 'session-ended' || reason === 'access-removed') lastEnded = reason;
	});
	const hints = config.hints;
	if (hints !== undefined) {
		// Flag results are fetched once the client starts; the hints follow as soon as it has.
		client.on('ready', () => void client.flags.setHints(hints).catch(() => undefined));
	}
	clientStore.set(client);
	return client;
}

/** For tests: forget the client. */
export function resetClient(): void {
	get(clientStore)?.destroy();
	clientStore.set(null);
	configStore.set(null);
	lastEnded = null;
}
