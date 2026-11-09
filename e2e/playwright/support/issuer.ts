/**
 * How a test sets the scene on the issuer: people, flags, billing facts, and
 * the links Bridge emails.
 *
 * Against the local issuer this is its `/__test` control API. Against a real
 * issuer (E2E_ISSUER) the same steps need the issuer's own test seams: a way
 * to read the links it emails, and an app key with which to make people and
 * set flags. Until those are wired in here, those steps say so and fail.
 */
export interface Person {
	readonly email: string;
	readonly password: string;
	readonly firstName?: string;
	readonly workspaces?: readonly { readonly id: string; readonly name: string; readonly role?: string }[];
}

export interface TestIssuer {
	readonly kind: 'local' | 'real';
	readonly issuer: string;
	reset(): Promise<void>;
	addPerson(person: Person): Promise<void>;
	/** The token of the last link emailed to `email` for `purpose` (`invite` for either invite email). */
	lastLink(email: string, purpose: 'verify-sign-up' | 'reset-password' | 'invite'): Promise<string>;
	/** Invites `email` into a workspace, as a member who may invite would, and returns the link's token. */
	invite(email: string, workspace: { readonly id: string; readonly name: string }, role?: string): Promise<string>;
	/** Makes an address's invites out of date, as if their 30 days had passed. */
	expireInvites(email: string): Promise<void>;
	/** Flag results for signed-in people (on top of the standard flags) and for visitors. */
	setFlags(signedIn: Record<string, unknown>, visitor?: Record<string, unknown>): Promise<void>;
	setFacts(facts: Record<string, unknown>): Promise<void>;
	/** Ends every session of a person, as Bridge does after a password reset or a removal. */
	endSessions(email: string): Promise<void>;
}

class LocalIssuer implements TestIssuer {
	readonly kind = 'local' as const;
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
}

class RealIssuer implements TestIssuer {
	readonly kind = 'real' as const;
	constructor(readonly issuer: string) {}
	private missing(step: string): never {
		throw new Error(`Against a real issuer, "${step}" needs the issuer's test seams wired into e2e/playwright/support/issuer.ts.`);
	}
	async reset() {}
	async addPerson(): Promise<void> {
		this.missing('make a person');
	}
	async lastLink(): Promise<string> {
		this.missing('read an emailed link');
	}
	async invite(): Promise<string> {
		this.missing('send an invite and read its link');
	}
	async expireInvites(): Promise<void> {
		this.missing('expire an invite');
	}
	async setFlags(): Promise<void> {
		this.missing('set flags');
	}
	async setFacts(): Promise<void> {
		this.missing('set billing facts');
	}
	async endSessions(): Promise<void> {
		this.missing('end sessions');
	}
}

export function testIssuer(): TestIssuer {
	const issuer = process.env.E2E_ISSUER_RESOLVED ?? '';
	const control = process.env.E2E_FAKE_CONTROL ?? '';
	return control !== '' ? new LocalIssuer(issuer, control) : new RealIssuer(issuer);
}
