// TBP-810 — the flag definitions `<FeatureFlag>` / `useFlag()` evaluate.
//
// The flags bundle used to fetch them only once the page was already showing,
// so every `<FeatureFlag>` rendered its fallback (a padlock) for a moment on
// each full page load. The root `load` now starts this read at the same time
// as the sign-in and billing reads and waits for it before the first render;
// `createBridgeFlags()` then takes the result instead of fetching again.
//
// Plain TS with no flags imports, so the core bootstrap can use it without
// pulling the flags bundle into auth-only apps.

let _url: string | null = null;
let _promise: Promise<unknown[] | null> | null = null;
let _result: unknown[] | null = null;

/** Where the definitions for an app live. */
export function flagDefinitionsUrl(apiBaseUrl: string, appKey: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/admin/flags-internal/flags-cache/${encodeURIComponent(appKey)}`;
}

/**
 * Start reading the definitions. Concurrent callers share one request.
 * Resolves to the list, or `null` when the read failed. Never rejects.
 */
export function prefetchFlagDefinitions(apiBaseUrl: string, appKey: string): Promise<unknown[] | null> {
  const url = flagDefinitionsUrl(apiBaseUrl, appKey);
  if (_promise && _url === url) return _promise;
  _url = url;
  _result = null;
  const promise: Promise<unknown[] | null> = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      return Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  })().then((list) => {
    if (_promise === promise) _result = list;
    return list;
  });
  _promise = promise;
  return promise;
}

/**
 * The prefetched definitions for this app, if they have arrived. One-shot: a
 * later caller (a remount, a reconnect) fetches fresh ones instead of reusing
 * what may be stale by then.
 */
export function takePrefetchedFlagDefinitions(apiBaseUrl: string, appKey: string): unknown[] | null {
  if (_url !== flagDefinitionsUrl(apiBaseUrl, appKey) || !_result) return null;
  const list = _result;
  _url = null;
  _promise = null;
  _result = null;
  return list;
}

/** Test-only. */
export function __resetFlagDefinitionsForTests(): void {
  _url = null;
  _promise = null;
  _result = null;
}
