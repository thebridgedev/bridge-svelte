// TBP-697 — in development, warn when the browser and the backend both count
// the same metric.
//
// The rule: count once, where the action happens. When the click calls your
// server, the backend handler counts (bridge-nestjs `@RequireQuota` /
// `@SyncQuota`) and the page only shows the number. When there is no backend
// that sees the action, the browser counts (`bridge.usage.report` / `set`).
// Doing both counts every action twice, and nothing else would ever say so.
//
// How it is noticed: outside production, bridge-nestjs marks a response from a
// counting endpoint with `X-Bridge-Usage-Counted: <metric>[, <metric>]`. This
// module remembers the metrics the backend said it counts and the metrics this
// page reported through `bridge.usage`, and warns once per metric that appears
// in both. A development build only: in production nothing is recorded and
// nothing is printed (and the backend does not send the header there anyway).
//
// Scope is the page session, which is one signed-in workspace — both sides
// count for the workspace of the user's token.

/** The response header bridge-nestjs sets, outside production, on a counting endpoint. */
export const USAGE_COUNTED_HEADER = 'x-bridge-usage-counted';

const countedByBackend = new Set<string>();
const countedByBrowser = new Set<string>();
const warned = new Set<string>();

function isDevBuild(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

function warnIfBoth(metric: string): void {
  if (warned.has(metric) || !countedByBackend.has(metric) || !countedByBrowser.has(metric)) return;
  warned.add(metric);
  console.warn(
    `[bridge] '${metric}' is counted twice: your backend counts it (bridge-nestjs @RequireQuota / @SyncQuota) ` +
      `and this page also reports it with bridge.usage. Count once, where the action happens: ` +
      `when the click calls your server, keep the backend count and remove the bridge.usage call. ` +
      `(Development only — this warning is not shown in production.)`,
  );
}

/** `bridge.usage.report` / `set` was called for `metric` from this page. */
export function noteBrowserCount(metric: string): void {
  if (!isDevBuild() || typeof metric !== 'string' || metric === '') return;
  countedByBrowser.add(metric);
  warnIfBoth(metric);
}

/** A response from the app's own backend — records the metrics it says it counted. */
export function noteBackendResponse(response: Response | null | undefined): void {
  if (!isDevBuild()) return;
  let value: string | null | undefined;
  try {
    value = response?.headers?.get(USAGE_COUNTED_HEADER);
  } catch {
    return;
  }
  if (!value) return;
  for (const raw of value.split(',')) {
    const metric = raw.trim();
    if (!metric) continue;
    countedByBackend.add(metric);
    warnIfBoth(metric);
  }
}

/** Test hook: forget everything seen so far. */
export function __resetDoubleCountWarning(): void {
  countedByBackend.clear();
  countedByBrowser.clear();
  warned.clear();
}
