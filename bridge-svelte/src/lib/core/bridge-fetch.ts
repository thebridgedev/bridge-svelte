import { getBridgeAuth } from './bridge-instance.js';

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
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    // Only act on requests to the bridge API — everything else passes through.
    if (!url.startsWith(apiBaseUrl)) return baseFetch(input, init);

    // 1. Inject current access token.
    const token = getBridgeAuth().getTokens()?.accessToken;
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await baseFetch(input, { ...init, headers });

    // Non-200s are returned as-is; httpFetch handles REST auth errors separately.
    if (!response.ok) return response;

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

    // 3. Refresh — same call as the WebSocket user.state_changed path.
    //    Dedup gate in BridgeAuth coalesces concurrent calls into one HTTP request.
    await getBridgeAuth().refreshTokens().catch(() => {});

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
 */
export async function bridgeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
