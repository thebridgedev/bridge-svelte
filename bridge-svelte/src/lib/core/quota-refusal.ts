/**
 * TBP-703 — "your backend refused this because a plan limit is reached", as an
 * event the app never has to wire.
 *
 * A backend guarded by `@RequireQuota` (bridge-nestjs) answers a request made at
 * the plan's cap with:
 *
 *   402 { statusCode: 402, code: 'QUOTA_EXCEEDED', message, metric, used, limit, fix }
 *
 * Both fetch paths hand every 402 they see to `observeQuotaRefusal()`:
 *   - the global fetch wrapper (`installBridgeAuthFetch`), for the page's own
 *     origin, Bridge's API and any `billing.apiOrigins` — so a page calling
 *     plain `fetch('/api/tickets')` needs no Bridge code at all;
 *   - `bridgeFetch()`, for any URL, because it is only ever pointed at the
 *     app's own backend.
 *
 * A matching body becomes a `BridgeQuotaRefusal`: `<BridgeBootstrap>` shows it
 * in `<BridgeUpgradeDialog>` (on by default), and `onBridgeQuotaExceeded()`
 * hands it to anything else that wants it. The caller still gets its response
 * untouched and at once: the body is read from a clone, after the fact.
 *
 * The dialog is decoration. The refusal is the backend's; this only explains it.
 */
import { readable, type Readable } from 'svelte/store';
import { openFeatureUpgrade, parseFeatureRefusal } from './feature-upgrade.js';

/** A backend's "plan limit reached" answer, as the upgrade dialog shows it. */
export interface BridgeQuotaRefusal {
  /** The quota metric the plan ran out of, e.g. `'tickets'`. */
  metric: string;
  /** How much was used when the request was refused, if the backend said. */
  used: number | null;
  /** The plan's cap, if the backend said. */
  limit: number | null;
  /**
   * Where to upgrade, from the refusal's `fix`. Only a same-app path
   * (`/subscription`, `/billing?from=tickets`) is kept: anything else is `null`
   * and the dialog uses `billing.manageRoute` instead.
   */
  fix: string | null;
  /** The backend's own message, if it sent one. */
  message: string | null;
  /** The URL of the request that was refused. */
  url: string;
}

/**
 * A same-app path, or null. A backend's `fix` becomes a link the user clicks,
 * so an absolute URL, a protocol-relative `//host` or a `javascript:` value is
 * never followed — the configured subscription page is used instead.
 */
export function safeFixPath(fix: unknown): string | null {
  if (typeof fix !== 'string') return null;
  const value = fix.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The refusal in a 402 body, or null when the body is not a quota refusal
 * (a 402 from a payment provider, a proxy, an old backend).
 */
export function parseQuotaRefusal(body: unknown, url = ''): BridgeQuotaRefusal | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.code !== 'QUOTA_EXCEEDED') return null;
  if (typeof b.metric !== 'string' || b.metric.trim() === '') return null;
  return {
    metric: b.metric,
    used: numberOrNull(b.used),
    limit: numberOrNull(b.limit),
    fix: safeFixPath(b.fix),
    message: typeof b.message === 'string' && b.message.trim() !== '' ? b.message : null,
    url,
  };
}

// ── The latest refusal + listeners ──────────────────────────────────────────

type Listener = (refusal: BridgeQuotaRefusal) => void;

const _listeners = new Set<Listener>();
let _current: BridgeQuotaRefusal | null = null;
let _setCurrent: ((value: BridgeQuotaRefusal | null) => void) | null = null;

/**
 * The refusal the upgrade dialog is showing, or `null`. Set by a refused
 * request, cleared by `dismissQuotaRefusal()`.
 */
export const quotaRefusal: Readable<BridgeQuotaRefusal | null> = readable<BridgeQuotaRefusal | null>(
  null,
  (set) => {
    _setCurrent = set;
    set(_current);
    return () => {
      _setCurrent = null;
    };
  },
);

/** Close the upgrade dialog. */
export function dismissQuotaRefusal(): void {
  _current = null;
  _setCurrent?.(null);
}

/**
 * Run `handler` every time a backend refuses a request because a plan limit is
 * reached — for an app that turned the dialog off (`billing.upgradeDialog:
 * false`) and shows something else, or that logs it. Returns an unsubscribe.
 */
export function onBridgeQuotaExceeded(handler: Listener): () => void {
  _listeners.add(handler);
  return () => {
    _listeners.delete(handler);
  };
}

/** Announce a refusal: the dialog shows it and every listener hears it. */
export function reportQuotaRefusal(refusal: BridgeQuotaRefusal): void {
  _current = refusal;
  _setCurrent?.(refusal);
  for (const listener of [..._listeners]) {
    try {
      listener(refusal);
    } catch {
      /* one broken listener must not stop the dialog or the others */
    }
  }
}

// One response is seen by both bridgeFetch and the global wrapper beneath it;
// it is announced once.
const _seen = new WeakSet<Response>();

/**
 * Hand a response to the refusal check. Does nothing unless it is a 402; for a
 * 402 it reads a clone of the body in the background and announces it when it
 * is a quota refusal. Never delays, consumes or changes the response.
 *
 * Returns the background read, for tests; callers never await it.
 */
export function observeQuotaRefusal(response: Response, url = ''): Promise<void> {
  if (response.status !== 402 || _seen.has(response)) return Promise.resolve();
  _seen.add(response);
  let clone: Response;
  try {
    clone = response.clone();
  } catch {
    return Promise.resolve(); // body already used — nothing to read
  }
  return clone
    .json()
    .then((body: unknown) => {
      const refusal = parseQuotaRefusal(body, url || response.url);
      if (refusal) {
        reportQuotaRefusal(refusal);
        return;
      }
      // TBP-756 — a flag-gated endpoint refused because the plan does not
      // include the feature: the same dialog, in its feature variant.
      const feature = parseFeatureRefusal(body);
      if (feature) openFeatureUpgrade(feature);
    })
    .catch(() => {
      /* not JSON — not a quota refusal */
    });
}

// ── Which URLs the global wrapper watches ───────────────────────────────────

function originOf(url: string, base?: string): string | null {
  try {
    return new URL(url, base).origin;
  } catch {
    return null;
  }
}

/**
 * Whether the global fetch wrapper should look at a 402 from `url`: the page's
 * own origin (a SvelteKit endpoint, a same-origin `/api` proxy), Bridge's API,
 * or an origin the app listed in `billing.apiOrigins`. A 402 from anywhere else
 * — a payment provider, a third-party API — is not the app's plan limit.
 */
export function watchesQuotaOrigin(
  url: string,
  options: { pageOrigin?: string; apiBaseUrl?: string; apiOrigins?: readonly string[] } = {},
): boolean {
  const target = originOf(url, options.pageOrigin);
  if (!target) return false;
  if (options.pageOrigin && target === originOf(options.pageOrigin)) return true;
  if (options.apiBaseUrl && target === originOf(options.apiBaseUrl)) return true;
  return (options.apiOrigins ?? []).some((o) => originOf(o) === target);
}

/** Test-only: forget listeners and the current refusal. */
export function __resetQuotaRefusalForTests(): void {
  _listeners.clear();
  dismissQuotaRefusal();
}
