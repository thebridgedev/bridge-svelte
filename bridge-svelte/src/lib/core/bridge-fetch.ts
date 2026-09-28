import { getBridgeAuth } from './bridge-instance.js';
import { observeQuotaRefusal, watchesQuotaOrigin } from './quota-refusal.js';
import { getConfig } from '../client/stores/config.store.js';
import { noteBackendResponse } from './double-count-warning.js';

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
}

function pageHref(): string | undefined {
  const href = (globalThis as { location?: { href?: unknown } }).location?.href;
  return typeof href === 'string' ? href : undefined;
}

/** `url` made absolute against the page, so a relative `/api/x` has an origin. */
function absoluteUrl(url: string): string {
  try {
    return new URL(url, pageHref()).href;
  } catch {
    return url;
  }
}

/**
 * TBP-703 — hand a 402 from a watched origin to the upgrade-dialog check.
 * Watched: the page's own origin, Bridge's API, and `billing.apiOrigins`.
 */
function observeIfWatched(response: Response, url: string, apiBaseUrl: string): void {
  if (response.status !== 402) return;
  let apiOrigins: readonly string[] | undefined;
  try {
    apiOrigins = getConfig().billing?.apiOrigins;
  } catch {
    apiOrigins = undefined;
  }
  const href = pageHref();
  const pageOrigin = href ? new URL(href).origin : undefined;
  if (watchesQuotaOrigin(url, { pageOrigin, apiBaseUrl, apiOrigins })) {
    void observeQuotaRefusal(response, absoluteUrl(url));
  }
}

/**
 * Wraps a fetch function with Bridge auth concerns for requests to `apiBaseUrl`.
 * Requests to other URLs pass through completely untouched.
 *
 * Two responsibilities:
 *   1. Inject the current access token as `Authorization: Bearer` so consumers
 *      never need auth code in their HTTP/GraphQL clients.
 *   2. Detect `TOKEN_VERSION_STALE` in GraphQL 200 responses (the reactive
 *      fallback when the WebSocket broadcast was missed), call `refreshTokens()`,
 *      and retry once with the fresh token.
 *
 * Both paths converge on `getBridgeAuth().refreshTokens()` — the same call the
 * WebSocket `user.state_changed` handler uses. The dedup gate in `BridgeAuth`
 * ensures only one POST /auth/token goes out even if both paths fire at once.
 *
 * Installed by `startBridgeRuntime()` patching `globalThis.fetch`.
 */
export function wrapFetchWithBridgeAuth(baseFetch: typeof fetch, apiBaseUrl: string): typeof fetch {
  return async function bridgeAuthFetch(input, init) {
    const url = requestUrl(input);

    // Only act on requests to the bridge API — everything else passes through
    // untouched. TBP-703: a 402 from the app's own backend is still LOOKED at
    // (never changed or delayed) so a plan-limit refusal opens the upgrade
    // dialog with no code on the page.
    if (!url.startsWith(apiBaseUrl)) {
      const passthrough = await baseFetch(input, init);
      observeIfWatched(passthrough, url, apiBaseUrl);
      noteBackendResponse(passthrough); // TBP-697 — dev-only double-count check
      return passthrough;
    }

    // 1. Inject current access token.
    const token = getBridgeAuth().getTokens()?.accessToken;
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await baseFetch(input, { ...init, headers });

    // Non-200s are returned as-is; httpFetch handles REST auth errors separately.
    if (!response.ok) {
      observeIfWatched(response, url, apiBaseUrl);
      return response;
    }

    // 2. Inspect body for TOKEN_VERSION_STALE without consuming the original
    //    response (URQL / callers need to read it themselves).
    const clone = response.clone();
    const body = await clone.json().catch(() => null);
    const isStale = Array.isArray(body?.errors) && body.errors.some(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        (e as { extensions?: { response?: { code?: string } } })
          .extensions?.response?.code === 'TOKEN_VERSION_STALE',
    );

    if (!isStale) return response;

    // 3. Refresh with a token minted AFTER this answer. The server just said
    //    our tokenVersion is behind, so a refresh that was already in flight
    //    (the per-connect reconcile, the WebSocket user.state_changed path)
    //    may have been minted before the bump and come back just as stale —
    //    retrying with it fails the same way and the caller sees "access
    //    token has been invalidated; refresh required". `fresh` waits for
    //    such a refresh and mints again (or joins one that started after
    //    this call), so the retry carries the current version.
    //    Stage, 2026-09-28: a new user's first CreateApp failed twice this way
    //    (retry sent tv 0 while the server was at tv 1). TBP-747.
    //    An auth-core older than 0.8.0-beta.2 (the peer range allows 0.7.x)
    //    ignores the option and joins the in-flight refresh, as before.
    const auth = getBridgeAuth();
    const refresh = auth.refreshTokens as (options?: { fresh?: boolean }) => Promise<unknown>;
    await refresh.call(auth, { fresh: true }).catch(() => {});

    const freshToken = getBridgeAuth().getTokens()?.accessToken;
    const freshHeaders = new Headers(init?.headers);
    if (freshToken) freshHeaders.set('Authorization', `Bearer ${freshToken}`);
    else freshHeaders.delete('Authorization');

    return baseFetch(input, { ...init, headers: freshHeaders });
  } as typeof fetch;
}

/**
 * TBP-697 — `bridgeFetch(url, init)`: `fetch` for calls to **your own backend**
 * that carry the signed-in user's Bridge access token.
 *
 *   import { bridgeFetch } from '@nebulr-group/bridge-svelte';
 *   const res = await bridgeFetch('/api/projects', { method: 'POST', body });
 *
 * Adds `Authorization: Bearer <access token>` (when signed in), and on a `401`
 * refreshes the token once and retries — so an expired token mid-session is
 * not an error the page has to handle. Same signature as `fetch`.
 *
 * Bridge's own API calls do not need it: those already carry the token.
 *
 * It sends the user's token to whatever URL you give it, so call it for your
 * backend only — never for a third-party URL.
 *
 * TBP-703 — a `402 { code: 'QUOTA_EXCEEDED', … }` answer (what bridge-nestjs's
 * `@RequireQuota` sends at the plan's cap) opens the upgrade dialog that
 * `<BridgeBootstrap>` mounts, whatever origin your backend is on. The response
 * is still returned to you unchanged.
 *
 * TBP-697 — in development, if your backend says it counted a metric (the
 * `X-Bridge-Usage-Counted` header bridge-nestjs sends outside production) and
 * this page also reports that metric with `bridge.usage`, the console warns
 * once: count once, where the action happens.
 */
export async function bridgeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetchWithToken(input, init);
  void observeQuotaRefusal(response, absoluteUrl(requestUrl(input)));
  noteBackendResponse(response);
  return response;
}

async function fetchWithToken(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let auth: ReturnType<typeof getBridgeAuth>;
  try {
    auth = getBridgeAuth();
  } catch {
    // Bridge not initialised (SSR, a test) — behave exactly like fetch.
    return fetch(input, init);
  }

  const withToken = (token: string | undefined): RequestInit => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  };

  const sentToken = auth.getTokens()?.accessToken;
  const response = await fetch(input, withToken(sentToken));
  if (response.status !== 401 || !sentToken) return response;

  // A streamed body is gone after the first attempt; it cannot be replayed.
  const replayable = !(input instanceof Request) && !(init?.body instanceof ReadableStream);
  if (!replayable) return response;

  const fresh = await auth.refreshTokens().catch(() => null);
  const freshToken = fresh?.accessToken ?? auth.getTokens()?.accessToken;
  if (!freshToken || freshToken === sentToken) return response;
  return fetch(input, withToken(freshToken));
}
