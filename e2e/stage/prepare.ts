/**
 * Prepares a run against a real Bridge server (stage): reads the parity
 * manifest, makes the run's developer sign in, and makes an app key for the
 * Child App, good for a day. The key is written, readable by this user only,
 * to E2E_STAGE_RUNTIME (outside the repository); nothing is printed.
 *
 * The Bridge App's own server key comes from E2E_BRIDGE_KEY, or from the secret
 * named by E2E_SECRET_ID (a JSON object holding CHECK_BRIDGE_KEY) in
 * E2E_SECRET_REGION, read with the machine's AWS credentials.
 *
 *   bun e2e/stage/prepare.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { bridgeRequest, expectStatus } from '../playwright/support/stage/http';
import { MANIFEST_ENV, readManifest, runtimePath, type Runtime } from '../playwright/support/stage/manifest';

const manifest = readManifest();
if (manifest === null) throw new Error(`${MANIFEST_ENV} names no parity manifest.`);

async function bridgeKey(): Promise<string> {
	if (process.env.E2E_BRIDGE_KEY) return process.env.E2E_BRIDGE_KEY;
	const id = process.env.E2E_SECRET_ID;
	if (!id) throw new Error('Set E2E_BRIDGE_KEY, or E2E_SECRET_ID and E2E_SECRET_REGION.');
	const client = new SecretsManagerClient({ region: process.env.E2E_SECRET_REGION });
	const value = JSON.parse((await client.send(new GetSecretValueCommand({ SecretId: id }))).SecretString ?? '{}') as Record<string, string>;
	if (!value['CHECK_BRIDGE_KEY']) throw new Error('The secret holds no CHECK_BRIDGE_KEY.');
	return value['CHECK_BRIDGE_KEY'];
}

const request = bridgeRequest(manifest.base);
const key = await bridgeKey();
const ia = (app: string, path: string) => `/identity-access/apps/${app}${path}`;

// The run's developer: a fresh password through the Bridge App's own server, then a real sign-in.
const link = expectStatus(await request('POST', '/identity-access/password-links', { 'x-api-key': key }, { email: manifest.developer.email }), 201, 'copying a password link').body;
const password = randomBytes(18).toString('base64url');
expectStatus(await request('POST', ia(manifest.home, '/password'), {}, { token: link['token'], password }), 200, 'setting the password');
const verifier = randomBytes(32).toString('base64url');
const challenged = expectStatus(
	await request('POST', ia(manifest.home, '/sign-in'), {}, { email: manifest.developer.email, password, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', workspace: manifest.developer.workspace }),
	200,
	'signing in',
).body;
const tokens = expectStatus(await request('POST', ia(manifest.home, '/token'), {}, { grant_type: 'authorization_code', code: challenged['code'], code_verifier: verifier }), 200, 'trading the code').body;
const bearer = { authorization: `Bearer ${String(tokens['access_token'])}` };

// Every privilege a key of the app may hold: the key is the run's own and ends with the app.
const offered = await request('GET', `/accounts/apps/${manifest.app.id}/key-privileges`, bearer);
const privileges =
	offered.status === 200
		? (Array.isArray(offered.body) ? (offered.body as unknown[]) : ((offered.body['privileges'] as unknown[] | undefined) ?? [])).map((each) => (typeof each === 'string' ? each : String((each as { key?: unknown }).key)))
		: ['users.passwords:reset'];

let appKey = '';
for (const until = Date.now() + 15_000; ; await new Promise((resolve) => setTimeout(resolve, 500))) {
	const made = await request('POST', ia(manifest.app.id, '/keys'), bearer, { name: 'Svelte stage run', privileges, expiresInDays: 1 });
	if (made.status === 404 && Date.now() < until) continue;
	appKey = String(expectStatus(made, 201, 'making an app key').body['key']);
	break;
}
const runtime: Runtime = { appKey, madeAt: Date.now() };
writeFileSync(runtimePath(), JSON.stringify(runtime), { mode: 0o600 });
console.log(`Prepared a run for app ${manifest.app.id}: an app key with ${privileges.length} privileges, kept in ${runtimePath()}.`);
