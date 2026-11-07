// Copied from @nebulr-group/bridge-auth-core's test fixtures (MIT), to sign tokens and revocation lists
// shaped exactly like Bridge's for the server helpers' tests. Keep in step with auth-core.
/**
 * Fixtures for the revocation puller: lane signing keys, signed entries and a
 * stand-in for the server that serves the list.
 *
 * Every key is generated inside the test run. Nothing here may use a
 * Node-only API: the same fixtures run on Node and in an edge runtime.
 */
import { CompactSign, exportJWK, generateKeyPair, type JWK } from 'jose';
import { APP, decodeSegment, encodeSegment } from './fixtures.js';

export const LIST_URL = 'https://auth.example.test/revocations';
export const REVOCATION_JWKS_URL = 'https://auth.example.test/.well-known/jwks.json';
export const LANES = ['sessions', 'members', 'billing', 'apps'] as const;
export type Lane = (typeof LANES)[number];

export function laneUrls(lanes: readonly string[] = LANES): Record<string, string> {
  return Object.fromEntries(lanes.map((lane) => [lane, `${LIST_URL}/${lane}`]));
}

export interface LaneKey {
  kid: string;
  lane: string;
  privateKey: CryptoKey;
  /** The public key as published in the app's key set, bound to its lane. */
  publicJwk: JWK & { lane?: string };
}

export async function makeLaneKey(lane: string, kid = `${lane}-key-1`): Promise<LaneKey> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig', lane };
  return { kid, lane, privateKey, publicJwk };
}

const encoder = new TextEncoder();

export interface SignOptions {
  kid?: string;
  typ?: string | null;
}

/** Sign an entry's payload the way a writer does: a compact JWS, ES256. */
export async function signEntry(key: LaneKey, payload: Record<string, unknown>, options: SignOptions = {}): Promise<string> {
  const header: Record<string, unknown> = { alg: 'ES256', kid: options.kid ?? key.kid };
  if (options.typ !== null) header.typ = options.typ ?? 'revocation+jws';
  return new CompactSign(encoder.encode(JSON.stringify(payload)))
    .setProtectedHeader(header as { alg: string })
    .sign(key.privateKey);
}

/** An unsigned entry (`alg: none`). */
export function unsignedEntry(payload: Record<string, unknown>): string {
  return `${encodeSegment({ alg: 'none', typ: 'revocation+jws' })}.${encodeSegment(payload)}.`;
}

/** What a writer asks for; the list adds the app, lane, number and time. */
export type Revocation = Record<string, unknown> & { kind: string };

const CUTOFF_SKEW_MS = 2000;
const WITHOUT_CUTOFF = new Set(['token', 'session', 'key']);

interface Stored {
  seq: number;
  at: number;
  before: number | null;
  jws: string;
}

/** Sign a lane's checkpoint the way the list does: a compact JWS, ES256, with the lane's key. */
export async function signCheckpoint(key: LaneKey, payload: Record<string, unknown>, options: SignOptions = {}): Promise<string> {
  return signEntry(key, payload, { typ: 'revocation-checkpoint+jws', ...options });
}

export interface ListRequest {
  lane: string;
  after: number;
  limit: number;
  v: string | null;
  cacheControl: string | null;
}

/**
 * A stand-in for the list server: one app, one numbered list per lane, each
 * entry signed with its lane's key, and every page carrying a checkpoint
 * signed with that key. `state` lets a test change what is served, to drop,
 * alter or add entries, or to tamper with or leave out the checkpoint.
 */
export function fakeRevocationList(
  keys: Record<string, LaneKey>,
  app = APP,
  now: () => number = () => Date.now(),
  urls: { list: string; jwks: string } = { list: LIST_URL, jwks: REVOCATION_JWKS_URL },
) {
  const lanes = new Map<string, Stored[]>();
  const floors = new Map<string, { floor: number; floorAt: number }>();
  const requests: ListRequest[] = [];
  const bodies = new Map<string, unknown>();
  let down: boolean | 'hang' = false;
  let jwks: { keys: JWK[] } = { keys: Object.values(keys).map((key) => key.publicJwk) };
  let keySetFetches = 0;
  let attempts = 0;
  const state = {
    /** Changes the page a lane serves. Gets the entries after the cursor and the head. */
    serve: null as null | ((lane: string, page: Stored[], head: number) => { entries: unknown[]; head: number } | null),
    /** Changes the checkpoint a lane serves: its payload before signing, or a whole replacement (undefined leaves it out). */
    checkpoint: null as
      | null
      | ((lane: string, payload: Record<string, unknown>) => Promise<{ jws: unknown } | null> | { jws: unknown } | null),
    /** Replaces the whole body a lane answers with, for example with one it sent earlier. */
    body: null as null | ((lane: string, fresh: unknown) => unknown),
  };

  function headOf(lane: string): number {
    const list = lanes.get(lane) ?? [];
    const floor = floors.get(lane)?.floor ?? 1;
    return list.length > 0 ? list[list.length - 1].seq : floor - 1;
  }

  async function revoke(lane: string, revocation: Revocation, keyOverride?: LaneKey): Promise<Stored> {
    const list = lanes.get(lane) ?? [];
    const seq = headOf(lane) + 1;
    const at = now();
    const payload: Record<string, unknown> = { v: 1, app, lane, seq, at, ...revocation };
    if (!WITHOUT_CUTOFF.has(revocation.kind) && payload.before === undefined) payload.before = at + CUTOFF_SKEW_MS;
    const key = keyOverride ?? keys[lane];
    if (!key) throw new Error(`no key for lane ${lane}`);
    const stored = {
      seq,
      at,
      before: typeof payload.before === 'number' ? payload.before : null,
      jws: await signEntry(key, payload),
    };
    list.push(stored);
    lanes.set(lane, list);
    return stored;
  }

  /** Drop a lane's entries up to and including `seq`, as the list does once they are old enough. */
  function prune(lane: string, seq: number): void {
    const list = lanes.get(lane) ?? [];
    const dropped = list.filter((entry) => entry.seq <= seq);
    const previous = floors.get(lane) ?? { floor: 1, floorAt: 0 };
    const floorAt = dropped.reduce((latest, entry) => Math.max(latest, entry.at, entry.before ?? 0), previous.floorAt);
    floors.set(lane, { floor: Math.max(previous.floor, seq + 1), floorAt });
    lanes.set(lane, list.filter((entry) => entry.seq > seq));
  }

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.href === urls.jwks) {
      keySetFetches += 1;
      return Response.json(jwks);
    }
    if (!url.href.startsWith(`${urls.list}/`)) return new Response('not found', { status: 404 });
    attempts += 1;
    if (down === 'hang') {
      // Never answers: the fetch ends only when the caller gives up on it.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new TypeError('fetch timed out')));
      });
    }
    if (down) throw new TypeError('fetch failed');
    const lane = url.pathname.split('/').pop() ?? '';
    const after = Number(url.searchParams.get('after'));
    const limit = Number(url.searchParams.get('limit'));
    requests.push({
      lane,
      after,
      limit,
      v: url.searchParams.get('v'),
      cacheControl: new Headers(init?.headers).get('cache-control'),
    });
    const list = lanes.get(lane) ?? [];
    const { floor, floorAt } = floors.get(lane) ?? { floor: 1, floorAt: 0 };
    const page = list.filter((entry) => entry.seq > Math.max(after, floor - 1)).slice(0, limit);
    const custom = state.serve?.(lane, page, headOf(lane)) ?? null;
    const entries = custom ? custom.entries : page.map((entry) => entry.jws);
    const head = custom ? custom.head : headOf(lane);
    const payload: Record<string, unknown> = { v: 1, app, lane, head, floor, floorAt, at: now() };
    const replaced = (await state.checkpoint?.(lane, payload)) ?? null;
    const key = keys[lane];
    const checkpoint = replaced ? replaced.jws : key ? await signCheckpoint(key, payload) : undefined;
    const fresh = { v: 1, app, lane, checkpoint, entries };
    const body = state.body ? state.body(lane, fresh) : fresh;
    bodies.set(lane, body);
    return Response.json(body);
  };

  return {
    fetch: fetchImpl as typeof fetch,
    revoke,
    prune,
    requests,
    state,
    entries: (lane: string) => lanes.get(lane) ?? [],
    /** The last body a lane answered with. */
    lastBody: (lane: string) => bodies.get(lane),
    /** `true`: every fetch of a lane fails at once. `'hang'`: it never answers. */
    setDown(value: boolean | 'hang') {
      down = value;
    },
    setKeys(keySet: { keys: JWK[] }) {
      jwks = keySet;
    },
    get jwks() {
      return jwks;
    },
    get keySetFetches() {
      return keySetFetches;
    },
    /** Every fetch of a lane, including those that failed because the list was down. */
    get attempts() {
      return attempts;
    },
  };
}

/** Change a signed entry's payload and keep its original signature. */
export function alterEntry(jws: string, change: (payload: Record<string, unknown>) => void): string {
  const [header, payload, signature] = jws.split('.');
  const decoded = decodeSegment(payload);
  change(decoded);
  return `${header}.${encodeSegment(decoded)}.${signature}`;
}
