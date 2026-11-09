// Copied from @nebulr-group/bridge-auth-core's test fixtures (MIT), to sign tokens and revocation lists
// shaped exactly like Bridge's for the server helpers' tests. Keep in step with auth-core.
/**
 * Fixtures for the credential verifier's conformance suite.
 *
 * Every key here is generated inside the test run and thrown away with it.
 * Nothing in this file may use a Node-only API (no Buffer, no node:*): the
 * same fixtures run on Node and in an edge runtime.
 */
import { SignJWT, base64url, exportJWK, generateKeyPair, importJWK, type JWK, type JWTPayload } from 'jose';

export const ISSUER = 'https://auth.example.test';
export const APP = 'app-acme';
export const OTHER_APP = 'app-globex';
export const BRIDGE_APP = 'app-bridge';
/** The API the tokens are issued for: the audience a verifier is configured with. Never the app id. */
export const AUDIENCE = 'https://api.example.test';
export const INTROSPECTION_URL = 'https://auth.example.test/keys/introspect';
export const JWKS_URL = 'https://auth.example.test/.well-known/jwks.json';

export interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  privateJwk: JWK;
  publicJwk: JWK;
}

export async function makeKey(kid: string): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair('PS256', { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  // No `alg` on the published key, as on a real key set: the verifier, not the
  // key, decides which algorithm is acceptable.
  const publicJwk = { ...(await exportJWK(publicKey)), kid, use: 'sig' };
  return { kid, privateKey, privateJwk, publicJwk };
}

export interface KeyRing {
  /** The app's own signing key. Its public half is the app's key set. */
  app: TestKey;
  /** Another app's signing key, with its own key id. */
  otherApp: TestKey;
  /** Another app's signing key that reuses the app's key id. */
  otherAppSameKid: TestKey;
  /** The app's published key set. */
  jwks: { keys: JWK[] };
}

export async function makeKeyRing(): Promise<KeyRing> {
  const app = await makeKey('acme-key-1');
  const otherApp = await makeKey('globex-key-1');
  const otherAppSameKid = await makeKey('acme-key-1');
  return { app, otherApp, otherAppSameKid, jwks: { keys: [app.publicJwk] } };
}

export interface MintOptions {
  alg?: string;
  typ?: string | null;
  kid?: string;
  issuer?: string;
  audience?: string | string[];
  expiresIn?: string | number | null;
  notBefore?: string | number;
  subject?: string | null;
  /** When the token says it was issued, in seconds. `null` leaves `iat` out. @default now */
  issuedAt?: number | null;
}

/** A person's access token, shaped like the ones The Bridge issues today. */
export function personClaims(overrides: JWTPayload = {}): JWTPayload {
  return {
    aid: APP,
    azp: APP,
    tid: 'ws-alpha',
    scope: 'invoices:read invoices:write',
    privileges: ['invoices:read', 'invoices:write'],
    role: 'ADMIN',
    email: 'alice@acme.test',
    ...overrides,
  };
}

/**
 * A token the issuer gave in exchange for a key, so the key itself is
 * presented only once. Its subject is the key's id.
 */
export function keyTokenClaims(
  kind: 'personal_key' | 'service_account_key' | 'app_key',
  overrides: JWTPayload = {},
): JWTPayload {
  const base: JWTPayload =
    kind === 'personal_key'
      ? { kind, aid: APP, tid: 'ws-alpha', uid: 'user-bob', privileges: ['reports:read'] }
      : kind === 'service_account_key'
        ? { kind, aid: APP, tid: 'ws-alpha', privileges: ['invoices:read'] }
        : { kind, aid: APP, privileges: ['members:write', 'workspaces:read'] };
  return { ...base, jti: `tok-${kind}`, ...overrides };
}

/** A background job's token: one workspace, no person. */
export function jobClaims(overrides: JWTPayload = {}): JWTPayload {
  return {
    kind: 'job',
    aid: APP,
    tid: 'ws-alpha',
    privileges: ['reports:export'],
    ...overrides,
  };
}

export async function mint(
  key: TestKey,
  claims: JWTPayload,
  options: MintOptions = {},
): Promise<string> {
  const alg = options.alg ?? 'PS256';
  const signingKey = alg === 'PS256' ? key.privateKey : await importJWK(key.privateJwk, alg);
  const header: Record<string, unknown> = { alg, kid: options.kid ?? key.kid };
  if (options.typ !== null) header.typ = options.typ ?? 'at+jwt';

  const jwt = new SignJWT(claims)
    .setProtectedHeader(header as { alg: string })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE);
  if (options.issuedAt !== null) jwt.setIssuedAt(options.issuedAt);
  if (options.subject !== null) jwt.setSubject(options.subject ?? 'user-alice');
  if (options.expiresIn !== null) jwt.setExpirationTime(options.expiresIn ?? '5m');
  if (options.notBefore !== undefined) jwt.setNotBefore(options.notBefore);
  return jwt.sign(signingKey);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeSegment(value: unknown): string {
  return base64url.encode(encoder.encode(JSON.stringify(value)));
}

export function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(decoder.decode(base64url.decode(segment)));
}

/** Change a signed token's payload and keep its original signature. */
export function tamper(token: string, change: (payload: Record<string, unknown>) => void): string {
  const [header, payload, signature] = token.split('.');
  const claims = decodeSegment(payload);
  change(claims);
  return `${header}.${encodeSegment(claims)}.${signature}`;
}

/** An unsigned token (`alg: none`) carrying the given claims. */
export function unsigned(claims: Record<string, unknown>): string {
  return `${encodeSegment({ alg: 'none', typ: 'at+jwt' })}.${encodeSegment(claims)}.`;
}

/** An HMAC token whose secret is the app's public key: the classic algorithm-confusion forgery. */
export async function hmacWithPublicKey(key: TestKey, claims: JWTPayload): Promise<string> {
  const secret = encoder.encode(JSON.stringify(key.publicJwk));
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', kid: key.kid, typ: 'at+jwt' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject('user-alice')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
}

export type IntrospectionReply =
  | { body: Record<string, unknown> }
  | { status: number }
  | { network: 'down' }
  | { text: string };

/**
 * A stand-in for the issuer's key introspection endpoint. Maps each key to a
 * reply; unknown keys are inactive. Records every key it was asked about.
 */
export function fakeIntrospection(replies: Record<string, IntrospectionReply>) {
  const asked: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== INTROSPECTION_URL || init?.method !== 'POST') {
      return new Response('not found', { status: 404 });
    }
    const { token } = JSON.parse(String(init.body)) as { token: string };
    asked.push(token);
    const reply = Object.prototype.hasOwnProperty.call(replies, token)
      ? replies[token]
      : { body: { active: false } };
    if ('network' in reply) throw new TypeError('fetch failed');
    if ('status' in reply) return new Response('error', { status: reply.status });
    if ('text' in reply) return new Response(reply.text, { status: 200 });
    return new Response(JSON.stringify(reply.body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch: fetchImpl as typeof fetch, asked };
}

/** Introspection answers for each kind of key, as the issuer would give them. */
export const KEYS = {
  personal: {
    active: true,
    type: 'api',
    kind: 'personal_key',
    sub: 'key-bob-reports',
    appId: APP,
    tenantId: 'ws-alpha',
    userId: 'user-bob',
    privileges: ['reports:read'],
    exp: 4102444800,
  },
  personalForOneJob: {
    active: true,
    type: 'api',
    kind: 'personal_key',
    sub: 'key-alice-export-42',
    appId: APP,
    tenantId: 'ws-alpha',
    userId: 'user-alice',
    jobId: 'export-42',
    privileges: ['invoices:read'],
    exp: 4102444800,
  },
  serviceAccount: {
    active: true,
    type: 'api',
    kind: 'service_account_key',
    sub: 'key-invoice-export',
    appId: APP,
    tenantId: 'ws-alpha',
    privileges: ['invoices:read'],
  },
  app: {
    active: true,
    type: 'api',
    kind: 'app_key',
    sub: 'key-acme-backend',
    appId: APP,
    tenantId: null,
    privileges: ['members:write', 'workspaces:read'],
  },
  service: {
    active: true,
    type: 'api',
    kind: 'service',
    sub: 'key-billing-service',
    appId: BRIDGE_APP,
    tenantId: null,
    privileges: ['usage:report'],
  },
  legacyAppWide: {
    active: true,
    type: 'api',
    sub: 'key-legacy-app',
    appId: APP,
    tenantId: null,
    privileges: ['USER_READ'],
    exp: 4102444800,
  },
  legacyWorkspace: {
    active: true,
    type: 'api',
    sub: 'key-legacy-ws',
    appId: APP,
    tenantId: 'ws-alpha',
    privileges: ['USER_READ'],
  },
  otherApp: {
    active: true,
    type: 'api',
    kind: 'app_key',
    sub: 'key-globex-backend',
    appId: OTHER_APP,
    tenantId: null,
    privileges: ['members:write'],
  },
} as const;
