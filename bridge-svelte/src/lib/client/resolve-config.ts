// TBP-695 — Bridge starts from one line with no arguments.
//
// The SDK used to read no environment at all: every app re-typed the same four
// `import.meta.env.VITE_BRIDGE_*` lines into its own +layout.ts, and the one it
// most often left out was the API address. A stage or local app id without it
// silently talked to PRODUCTION, where that app does not exist. Reading the
// standard variables here removes the boilerplate AND the trap; the no-guess
// rule below is what keeps the second half true.

import type { BridgeConfig } from '../shared/types/config.js';
import { logger } from '../shared/logger.js';

/** Where Bridge's production API lives — the default when no address is set. */
export const PRODUCTION_API_BASE_URL = 'https://api.thebridge.dev';

/** The standard Vite variables Bridge reads, already mapped to config fields. */
export interface BridgeEnv {
  appId?: string;
  apiBaseUrl?: string;
  hostedUrl?: string;
  debug?: string;
}

/**
 * Read the `VITE_BRIDGE_*` variables from the consuming app's build.
 *
 * Every access is a literal `import.meta.env.VITE_…` property read on purpose:
 * that is the form Vite statically replaces, including in a library consumed
 * from node_modules. A dynamic key (`env[name]`) would not be replaced.
 * The try/catch covers a non-Vite bundler, where `import.meta.env` is undefined.
 */
export function readBridgeEnv(): BridgeEnv {
  try {
    return {
      appId: import.meta.env.VITE_BRIDGE_APP_ID,
      apiBaseUrl: import.meta.env.VITE_BRIDGE_API_BASE_URL,
      hostedUrl: import.meta.env.VITE_BRIDGE_HOSTED_URL,
      debug: import.meta.env.VITE_BRIDGE_DEBUG,
    };
  } catch {
    return {};
  }
}

/**
 * The hosted pages for an API address on Bridge's own domains: `api` becomes
 * `auth`, so `api-stage.thebridge.dev` pairs with `auth-stage.thebridge.dev`.
 *
 * Without this, a stage app that sets only its API address (the documented
 * shape) still sent sign-in to production's hosted pages, where its app id does
 * not exist — the same wrong-environment failure as the API address, one hop
 * later. Any other host (localhost, self-hosted) cannot be derived.
 */
export function hostedUrlFor(apiBaseUrl: string): string | undefined {
  try {
    const url = new URL(apiBaseUrl);
    const match = /^api(-[a-z0-9-]+)?\.thebridge\.dev$/.exec(url.hostname);
    return match ? `https://auth${match[1] ?? ''}.thebridge.dev` : undefined;
  } catch {
    return undefined;
  }
}

function isDevBuild(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

// An empty variable means "not set". Vite loads `KEY=` as '' and the demo's
// tracked .env files use exactly that to stop a key falling through to a
// developer's .env.local — so '' must never count as a value.
function present(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Build the effective config: an option passed explicitly wins over the
 * environment, and the environment wins over the built-in default.
 *
 * The hosted-pages address follows the API address on Bridge's own domains
 * (see `hostedUrlFor`), so one variable is enough for stage.
 *
 * Refuses to guess: with no app id anywhere it throws, naming the variable to
 * set. An app id with no API address runs against production — that is the
 * documented shape of a production app (`VITE_BRIDGE_APP_ID` alone) — and in a
 * development build it says so once, naming `VITE_BRIDGE_API_BASE_URL`, because
 * a stage or local id against production is the mistake this exists to catch.
 */
export function resolveBridgeConfig(
  options: Partial<BridgeConfig> = {},
  env: BridgeEnv = readBridgeEnv(),
  dev: boolean = isDevBuild()
): BridgeConfig {
  const appId = present(options.appId) ?? present(env.appId);
  if (!appId) {
    throw new Error(
      '[bridge] No Bridge app id was found. Set VITE_BRIDGE_APP_ID in your .env ' +
        '(plus VITE_BRIDGE_API_BASE_URL for a stage or local app), ' +
        'or pass { appId } to bridgeBootstrap().'
    );
  }

  const apiBaseUrl = present(options.apiBaseUrl) ?? present(env.apiBaseUrl);
  const hostedUrl =
    present(options.hostedUrl) ?? present(env.hostedUrl) ?? (apiBaseUrl ? hostedUrlFor(apiBaseUrl) : undefined);
  const debug = options.debug ?? (present(env.debug) === undefined ? undefined : env.debug === 'true');

  if (!apiBaseUrl && dev) {
    logger.warn(
      `[bridge] VITE_BRIDGE_API_BASE_URL is not set, so app ${appId} is using production ` +
        `(${PRODUCTION_API_BASE_URL}). Set it if this is a stage or local app.`
    );
  }
  if (apiBaseUrl && !hostedUrl && dev) {
    logger.warn(
      `[bridge] VITE_BRIDGE_HOSTED_URL is not set and cannot be derived from ${apiBaseUrl}, ` +
        `so sign-in pages will open on production. Set it to this environment's hosted pages.`
    );
  }

  const resolved: BridgeConfig = { ...options, appId };
  if (apiBaseUrl) resolved.apiBaseUrl = apiBaseUrl;
  else delete resolved.apiBaseUrl;
  if (hostedUrl) resolved.hostedUrl = hostedUrl;
  else delete resolved.hostedUrl;
  if (debug !== undefined) resolved.debug = debug;
  return resolved;
}
