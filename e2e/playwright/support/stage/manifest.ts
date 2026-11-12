import { readFileSync } from 'node:fs';

/**
 * What the parity fixture leaves for a run (ids, addresses and the inbox's
 * place; never a secret), and what `e2e/stage/prepare.ts` adds at run time
 * (an app key for this run, kept outside the repository).
 */
export interface Manifest {
	readonly version: 1;
	readonly complete: boolean;
	readonly base: string;
	readonly app: { readonly id: string; readonly name: string; readonly issuer: string; readonly hostedSignIn: string };
	readonly home: string;
	readonly developer: { readonly workspace: string; readonly email: string };
	readonly branding: { readonly scheme: string; readonly colors: Readonly<Record<string, string>>; readonly radius: string; readonly font: string };
	readonly languages: { readonly default: string; readonly enabled: readonly string[] };
	readonly flags: readonly { readonly key: string; readonly state: string; readonly gate: string }[];
	readonly plans: readonly { readonly key: string; readonly paid: boolean; readonly trialDays: number | null; readonly metered: string | null; readonly features: readonly string[] }[];
	readonly stripe: { readonly connected: boolean; readonly account: string | null; readonly skipped: string | null };
	readonly inbox: { readonly domain: string; readonly bucket: string; readonly region: string; readonly addressPattern: string } | { readonly skipped: string };
}

export const MANIFEST_ENV = 'E2E_PARITY_MANIFEST';
export const RUNTIME_ENV = 'E2E_STAGE_RUNTIME';
export const DEFAULT_RUNTIME = '/tmp/bridge-stage-runtime.json';

/** The manifest the run names, or null when the run is not against stage. */
export function readManifest(env: NodeJS.ProcessEnv = process.env): Manifest | null {
	const path = env[MANIFEST_ENV] ?? '';
	if (path === '') return null;
	const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
	if (manifest.version !== 1 || typeof manifest.app?.id !== 'string') throw new Error(`${path} is not a parity manifest.`);
	return manifest;
}

export interface Runtime {
	readonly appKey: string;
	readonly madeAt: number;
}

export const runtimePath = (env: NodeJS.ProcessEnv = process.env): string => env[RUNTIME_ENV] || DEFAULT_RUNTIME;

export function readRuntime(env: NodeJS.ProcessEnv = process.env): Runtime | null {
	try {
		return JSON.parse(readFileSync(runtimePath(env), 'utf8')) as Runtime;
	} catch {
		return null;
	}
}
