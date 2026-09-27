// TBP-696 — one file serves every auth page.
//
// An app used to hand-write seven near-identical pages under `src/routes/auth/`,
// and the one it most often skipped — `set-password/[token]`, because "we don't
// use passwords" — is the address bridge-api writes into every signup
// verification email. Skipping it sent every new signup to a 404. With
// `src/routes/auth/[...bridge]/+page.svelte` rendering `<BridgeAuthRoutes />`,
// the plugin owns that list, so a page cannot be forgotten.
//
// This module is the list and its parser. It is shared by the component (which
// page to render) and by `bridgeBootstrap()`'s load (which answers an unknown
// segment with a real 404 — a component cannot, since only a `load` reaches the
// app's own error page).

/** Every page `<BridgeAuthRoutes>` serves, by its first path segment. */
export const BRIDGE_AUTH_PAGES = [
  'login',
  'signup',
  'oauth-callback',
  'set-password',
  'forgot-password',
  'magic-link',
  'setup-passkey',
  'workspaces',
] as const;

/** One of the pages `<BridgeAuthRoutes>` serves. */
export type BridgeAuthPage = (typeof BRIDGE_AUTH_PAGES)[number];

/** A parsed auth route: which page, and the email-link token where it has one. */
export interface BridgeAuthRoute {
  page: BridgeAuthPage;
  /** The one-time token of `set-password/[token]` and `setup-passkey/[token]`. */
  token?: string;
}

/** Pages reached from an email link, whose second segment is the token. */
const TOKEN_PAGES: ReadonlySet<BridgeAuthPage> = new Set(['set-password', 'setup-passkey']);

/** The rest parameter name the catch-all route must use: `[...bridge]`. */
export const BRIDGE_AUTH_ROUTE_PARAM = 'bridge';

/**
 * Parse the `[...bridge]` rest parameter into a page, or `null` when it names
 * no page Bridge serves — the caller then answers with the app's own 404.
 *
 * Exact shapes only: `login` but not `login/extra`, and `set-password/<token>`
 * but not a bare `set-password`. A page that half-matches would otherwise render
 * a form at an address nobody links to.
 */
export function parseBridgeAuthRoute(rest: string | undefined | null): BridgeAuthRoute | null {
  if (typeof rest !== 'string') return null;
  const segments = rest.split('/').filter((s) => s !== '');
  const [first, token] = segments;
  if (!first || !(BRIDGE_AUTH_PAGES as readonly string[]).includes(first)) return null;
  const page = first as BridgeAuthPage;

  if (TOKEN_PAGES.has(page)) {
    return segments.length === 2 && token ? { page, token } : null;
  }
  return segments.length === 1 ? { page } : null;
}

/**
 * True when a SvelteKit route id is a Bridge auth catch-all, e.g.
 * `/auth/[...bridge]`. Only that exact param name counts, so an app's own
 * unrelated catch-all is never 404'd by Bridge.
 */
export function isBridgeAuthRouteId(routeId: string | null | undefined): boolean {
  return typeof routeId === 'string' && routeId.endsWith(`/[...${BRIDGE_AUTH_ROUTE_PARAM}]`);
}

/**
 * The URL prefix the catch-all lives under: `/auth` for `/auth/login` when the
 * rest parameter is `login`. Links between the pages are built from it, so the
 * catch-all can live anywhere, not only at `/auth`.
 */
export function bridgeAuthBase(pathname: string, rest: string | undefined | null): string {
  // Count segments rather than comparing text: `pathname` is URL-encoded and the
  // param is decoded, so a token with an escaped character would not match.
  const restCount = (rest ?? '').split('/').filter((s) => s !== '').length;
  const segments = pathname.split('/').filter((s) => s !== '');
  const kept = segments.slice(0, Math.max(0, segments.length - restCount));
  return kept.length ? `/${kept.join('/')}` : '';
}
