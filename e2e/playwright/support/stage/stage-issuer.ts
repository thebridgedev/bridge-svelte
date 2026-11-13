import { randomUUID } from 'node:crypto';
import { bridgeRequest, expectStatus, type Request } from './http';
import { Inbox, bridgeLink } from './inbox';
import { readManifest, readRuntime, type Manifest } from './manifest';
import type { LinkPurpose, Person, TestIssuer } from '../issuer';

const STEP: Record<LinkPurpose, string> = { 'verify-sign-up': 'verify-email', 'reset-password': 'reset-password', invite: 'invite', 'magic-link': 'magic-link', 'passkey-setup': 'passkey-setup' };

/** The demo's plan names (`free`, `pro`) as the stage app's plans call them. */
/** Roles a test names that the app does not have: made on first use, with these privileges. */
const TEST_ROLES: Record<string, readonly string[]> = { READER: ['USER_READ'] };

const PLAN_KEYS: Record<string, string> = { free: 'parity-free', pro: 'parity-pro', team: 'parity-team' };

/** A flag of the standard set that Bridge decides itself, so a test cannot set it. */
export class NotSettable extends Error {}

interface Workspace {
	readonly id: string;
	readonly name: string;
}

/**
 * The test seams of a real Bridge server, through its public routes only, as
 * the app's own server uses them: the app key made for this run
 * (`e2e/stage/prepare.ts`) makes people and workspaces, invites, sets flags
 * and plans and suspends; the links Bridge emails are read from the stage test
 * inbox.
 */
export class StageIssuer implements TestIssuer {
	readonly kind = 'real' as const;
	readonly issuer: string;
	readonly manifest: Manifest;
	private readonly request: Request;
	private readonly inbox: Inbox;
	private readonly domain: string;
	private readonly appKey: string;
	private since = new Date();
	/** The workspaces this test made, by the id the spec gave them. */
	private workspaces = new Map<string, Workspace>();
	private users = new Map<string, string>();
	private seen = new Map<string, Set<string>>();
	private flagsTouched = new Set<string>();
	/** People suspended to end their sessions: resumed when the next test starts. */
	private suspended: string[] = [];

	constructor(manifest: Manifest, appKey: string) {
		this.manifest = manifest;
		this.issuer = manifest.app.issuer;
		this.request = bridgeRequest(manifest.base);
		this.appKey = appKey;
		if ('skipped' in manifest.inbox) throw new Error(`The run has no test inbox: ${manifest.inbox.skipped}`);
		this.domain = manifest.inbox.domain;
		this.inbox = new Inbox(manifest.inbox);
	}

	private keyed(workspace?: string): Record<string, string> {
		return { 'x-api-key': this.appKey, ...(workspace === undefined ? {} : { 'bridge-workspace': workspace }) };
	}

	get plans() {
		const free = this.manifest.plans.find((plan) => !plan.paid)?.key ?? PLAN_KEYS['free']!;
		return { free, pro: PLAN_KEYS['pro']!, count: this.manifest.plans.length };
	}

	workspaceId(spec: string): string {
		return this.workspaces.get(spec)?.id ?? spec;
	}

	async reset(): Promise<void> {
		for (const user of this.suspended) await this.request('POST', `/accounts/users/${user}/resume`, this.keyed(), {});
		this.suspended = [];
		// A test's flags go back to what the app had: the flags a test made are removed, the others set back.
		for (const key of this.flagsTouched) await this.request('DELETE', `/flags/flags/${key}`, this.keyed());
		this.flagsTouched.clear();
		this.workspaces = new Map();
		this.users = new Map();
		this.seen = new Map();
		this.since = new Date();
	}

	private rolesMade = new Set<string>();

	private async ensureRole(key: string): Promise<void> {
		const privileges = TEST_ROLES[key];
		if (privileges === undefined || this.rolesMade.has(key)) return;
		const made = await this.request('POST', '/accounts/roles', this.keyed(), { key, name: key, privileges });
		if (made.status !== 201 && made.status !== 409) expectStatus(made, 201, `making the role ${key}`);
		this.rolesMade.add(key);
		// Whoever signs in next gets a token issued after the role took effect.
		if (made.status === 201) await new Promise((resolve) => setTimeout(resolve, 3_000));
	}

	private async ensureWorkspace(spec: Workspace, owner: string): Promise<{ id: string; created: boolean; userId?: string }> {
		const known = this.workspaces.get(spec.id);
		if (known) return { id: known.id, created: false };
		const made = expectStatus(await this.request('POST', '/accounts/workspaces', this.keyed(), { owner: { email: owner }, name: spec.name }), 201, 'making a workspace').body;
		const id = String(made['id']);
		this.workspaces.set(spec.id, { id, name: spec.name });
		return { id, created: true, userId: (made['owner'] as { user: { id: string } }).user.id };
	}

	async addPerson(person: Person): Promise<void> {
		const memberships = person.workspaces ?? [];
		if (memberships.length === 0) throw new NotSettable('A person with no workspace cannot be made through the app server routes.');
		let userId = '';
		for (const membership of memberships) {
			const workspace = await this.ensureWorkspace(membership, person.email);
			if (workspace.created) userId = workspace.userId ?? userId;
			else {
				await this.ensureRole(membership.role ?? 'MEMBER');
				const added = expectStatus(await this.request('POST', '/accounts/members', this.keyed(workspace.id), { email: person.email, role: membership.role ?? 'MEMBER' }), 201, 'adding a member').body;
				userId = String((added['user'] as { id: unknown }).id);
			}
		}
		this.users.set(person.email, userId);
		const link = expectStatus(await this.request('POST', '/identity-access/password-links', this.keyed(), { email: person.email }), 201, 'copying a password link').body;
		expectStatus(await this.request('POST', `/identity-access/apps/${this.manifest.app.id}/password`, {}, { token: link['token'], password: person.password }), 200, 'setting the password');
	}

	async lastLink(email: string, purpose: LinkPurpose): Promise<string> {
		const step = STEP[purpose];
		const seen = this.seen.get(email) ?? new Set<string>();
		this.seen.set(email, seen);
		const mail = await this.inbox.waitFor(email, this.since, (each) => {
			const link = bridgeLink(each);
			return link !== null && link.step === step && !seen.has(link.token);
		});
		const token = bridgeLink(mail)!.token;
		seen.add(token);
		return token;
	}

	async invite(email: string, workspace: { readonly id: string; readonly name: string }, role = 'MEMBER'): Promise<string> {
		const real = (await this.ensureWorkspace(workspace, `owner-${randomUUID().slice(0, 8)}@${this.domain}`)).id;
		expectStatus(await this.request('POST', '/accounts/invites', this.keyed(real), { email, role }), 201, 'inviting');
		return this.lastLink(email, 'invite');
	}

	async expireInvites(): Promise<void> {
		throw new NotSettable('A real server has no way to make an invite older: it expires after 30 days.');
	}

	async setFlags(signedIn: Record<string, unknown>, visitor: Record<string, unknown> = {}): Promise<void> {
		if (Object.keys(visitor).length > 0) throw new NotSettable('Flags for visitors are set by a flag being public, which this adapter does not do.');
		for (const [key, wanted] of Object.entries(signedIn)) {
			if (key.startsWith('bridge-')) throw new NotSettable(`${key} is decided by Bridge (a privilege or the plan), not set by a test.`);
			const result = typeof wanted === 'object' && wanted !== null ? (wanted as { value?: unknown; metadata?: { entitlement?: string } }) : { value: wanted };
			const entitlement = result.metadata?.entitlement;
			const body =
				entitlement !== undefined
					? { state: 'on-with-rule', rule: { branches: [{ conditions: [{ attribute: `bridge:billing.entitlement.${entitlement}`, operator: 'eq', values: [true] }], returnValue: true }], otherwiseValue: false } }
					: { state: result.value === true ? 'on' : 'off' };
			const existing = await this.request('GET', `/flags/flags/${key}`, this.keyed());
			// A change names the revision it is made on.
			if (existing.status === 200) expectStatus(await this.request('PATCH', `/flags/flags/${key}`, { ...this.keyed(), 'if-match': `"${String(existing.body['revision'])}"` }, body), 200, `setting flag ${key}`);
			else {
				expectStatus(await this.request('POST', '/flags/flags', this.keyed(), { key, description: 'Made by the svelte stage run', ...body }), 201, `making flag ${key}`);
				this.flagsTouched.add(key);
			}
		}
	}

	async setFacts(facts: Record<string, unknown>): Promise<void> {
		const plan = (facts['plan'] as { key?: string } | undefined)?.key;
		for (const workspace of this.workspaces.values()) {
			expectStatus(
				await this.request('PUT', '/billing/payer/subscription', this.keyed(workspace.id), {
					plan: plan === undefined ? PLAN_KEYS['pro'] : (PLAN_KEYS[plan] ?? plan),
					...(typeof facts['trialEnd'] === 'string' ? { trialEnd: facts['trialEnd'] } : {}),
				}),
				200,
				'setting the workspace plan',
			);
			// The person's next read of their billing shows it: wait for the payer to say so.
			const wanted = plan === undefined ? PLAN_KEYS['pro']! : (PLAN_KEYS[plan] ?? plan);
			for (let attempt = 0; attempt < 10; attempt++) {
				const payer = await this.request('GET', '/billing/payer', this.keyed(workspace.id));
				if (payer.status === 200 && payer.text.includes(wanted) && (typeof facts['trialEnd'] !== 'string' || payer.text.includes('trial'))) break;
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}
		}
	}

	async signedInLongAgo(): Promise<void> {
		throw new NotSettable('A real server has no way to make a sign-in older: it asks again only after an hour.');
	}

	async endSessions(email: string): Promise<void> {
		const user = this.users.get(email);
		if (user === undefined) throw new Error(`${email} was not made by this test.`);
		// Suspending ends every session within seconds; the person is resumed when the next test starts.
		expectStatus(await this.request('POST', `/accounts/users/${user}/suspend`, this.keyed(), {}), 200, 'suspending');
		this.suspended.push(user);
		await new Promise((resolve) => setTimeout(resolve, 5_000));
	}
}

export function stageIssuer(): StageIssuer | null {
	const manifest = readManifest();
	if (manifest === null) return null;
	const runtime = readRuntime();
	if (runtime === null) throw new Error('No run key: run `bun e2e/stage/prepare.ts` first.');
	return new StageIssuer(manifest, runtime.appKey);
}
