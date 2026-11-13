/**
 * How a test sets the scene on the issuer: people, flags, billing facts, and
 * the links Bridge emails.
 *
 * Against the local issuer this is its `/__test` control API. Against a real
 * Bridge server (stage) it is `stage/stage-issuer.ts`: the app's own key for
 * people, flags and plans, and the test inbox for the links.
 */
import { stageIssuer } from './stage/stage-issuer';

/** The emails whose link a test reads: `invite` for either invite email. */
export type LinkPurpose = 'verify-sign-up' | 'reset-password' | 'invite' | 'magic-link' | 'passkey-setup';

export interface Person {
	readonly email: string;
	readonly password: string;
	readonly firstName?: string;
	readonly workspaces?: readonly { readonly id: string; readonly name: string; readonly role?: string }[];
}

export interface TestIssuer {
	readonly kind: 'local' | 'real';
	readonly issuer: string;
	/** The plans the app offers, as a test names them. */
	readonly plans: { readonly free: string; readonly pro: string; readonly count: number };
	reset(): Promise<void>;
	/** The server's id for a workspace the spec named (the local issuer keeps the spec's own). */
	workspaceId(spec: string): string;
	addPerson(person: Person): Promise<void>;
	/** The token of the last link emailed to `email` for `purpose` (`invite` for either invite email). */
	lastLink(email: string, purpose: LinkPurpose): Promise<string>;
	/** Invites `email` into a workspace, as a member who may invite would, and returns the link's token. */
	invite(email: string, workspace: { readonly id: string; readonly name: string }, role?: string): Promise<string>;
	/** Makes an address's invites out of date, as if their 30 days had passed. */
	expireInvites(email: string): Promise<void>;
	/** Flag results for signed-in people (on top of the standard flags) and for visitors. */
	setFlags(signedIn: Record<string, unknown>, visitor?: Record<string, unknown>): Promise<void>;
	setFacts(facts: Record<string, unknown>): Promise<void>;
	/** Ends every session of a person, as Bridge does after a password reset or a removal. */
	endSessions(email: string): Promise<void>;
	/** Makes every session's last sign-in an hour old, so actions that want a recent sign-in ask the person to confirm it is them. */
	signedInLongAgo(): Promise<void>;
}

class LocalIssuer implements TestIssuer {
	readonly kind = 'local' as const;
	readonly plans = { free: 'free', pro: 'pro', count: 2 };
	constructor(
		readonly issuer: string,
		private readonly control: string,
	) {}

	private async call(path: string, body?: unknown): Promise<unknown> {
		const response = await fetch(`${this.control}${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers: { 'content-type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		if (!response.ok) throw new Error(`local issuer ${path}: ${response.status} ${await response.text()}`);
		return response.json();
	}

	async reset() {
		await this.call('/reset', {});
	}
	workspaceId(spec: string) {
		return spec;
	}
	async addPerson(person: Person) {
		await this.call('/people', person);
	}
	async lastLink(email: string, purpose: string) {
		const query = new URLSearchParams({ to: email, purpose });
		return ((await this.call(`/link?${query}`)) as { token: string }).token;
	}
	async invite(email: string, workspace: { readonly id: string; readonly name: string }, role?: string) {
		return ((await this.call('/invite', { email, workspace, ...(role === undefined ? {} : { role }) })) as { token: string }).token;
	}
	async expireInvites(email: string) {
		await this.call('/expire-invites', { email });
	}
	async setFlags(signedIn: Record<string, unknown>, visitor: Record<string, unknown> = {}) {
		await this.call('/flags', { signedIn, visitor });
	}
	async setFacts(facts: Record<string, unknown>) {
		await this.call('/facts', facts);
	}
	async endSessions(email: string) {
		await this.call('/end-sessions', { email });
	}
	async signedInLongAgo() {
		await this.call('/signed-in-long-ago', {});
	}
}

let stage: TestIssuer | null | undefined;

/** The local issuer by default; the run's real Bridge server (stage) when E2E_PARITY_MANIFEST names its manifest. */
export function testIssuer(): TestIssuer {
	const control = process.env.E2E_FAKE_CONTROL ?? '';
	if (control !== '') return new LocalIssuer(process.env.E2E_ISSUER_RESOLVED ?? '', control);
	stage ??= stageIssuer();
	if (stage === null) throw new Error('Set E2E_PARITY_MANIFEST (a real Bridge server) or run with the local issuer.');
	return stage;
}
