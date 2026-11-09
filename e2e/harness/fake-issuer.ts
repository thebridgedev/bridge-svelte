/**
 * A local issuer for the demo's Playwright suite: auth-core's fake issuer,
 * served over HTTP with browser access (CORS), plus a small control API under
 * `/__test` the tests use to set the scene: people, flags, plans and the
 * links Bridge would email.
 *
 * It answers the way Bridge does, but it is not Bridge: its tokens are not
 * signed, so the server-side token check cannot run against it. Point the
 * suite at a real issuer with E2E_ISSUER for that.
 *
 *   bun e2e/harness/fake-issuer.ts            # listens on :4400
 */
import { createFakeIssuer, type FakeIssuer } from '@nebulr-group/bridge-auth-core/testing';

const PORT = Number(process.env.FAKE_ISSUER_PORT ?? 4400);
const ORIGIN = `http://localhost:${PORT}`;
const APP_ID = 'app-demo';

/** What every test starts from: the app is active, the person may manage billing and the team, two plans. */
const STANDARD_FLAGS = { 'bridge-app-active': true, 'bridge-billing-manage': true, 'bridge-team-manage': true };
const PLANS = [
	{ key: 'free', name: 'Free', description: 'For trying it out', archived: false, free: true, prices: [], features: ['tickets'], limits: { tickets: 3 }, trial: null },
	{ key: 'pro', name: 'Pro', description: 'For teams', archived: false, free: false, prices: [{ currency: 'usd', interval: 'month', amount: 2900 }], features: ['tickets', 'reports', 'pdf-export'], limits: { tickets: null }, trial: null },
];

let fake: FakeIssuer = fresh();

function fresh(): FakeIssuer {
	const made = createFakeIssuer({ origin: ORIGIN, appId: APP_ID });
	made.withoutLiveConnection();
	made.setFlags(STANDARD_FLAGS);
	made.setPlans(PLANS);
	made.setFacts({ plan: { key: 'free', name: 'Free' }, status: 'active', access: 'ok', limits: { tickets: 3 }, usage: { tickets: 1 } });
	return made;
}

function cors(request: Request, response: Response): Response {
	const origin = request.headers.get('origin');
	if (origin === null) return response;
	const headers = new Headers(response.headers);
	headers.set('access-control-allow-origin', origin);
	headers.set('access-control-expose-headers', 'Content-Type, ETag, Retry-After, WWW-Authenticate');
	headers.append('vary', 'Origin');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function control(path: string, request: Request, url: URL): Promise<Response> {
	const body = request.method === 'POST' ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
	switch (path) {
		case '/reset':
			fake = fresh();
			return json({ issuer: fake.issuer });
		case '/people': {
			const person = fake.addPerson(body as never);
			return json({ id: person.id, email: person.email });
		}
		case '/invite': {
			// As a member who may invite would: the link's token, as Bridge emails it.
			const workspace = body['workspace'] as { id: string; name: string };
			return json({ token: fake.invite(String(body['email'] ?? ''), workspace, (body['role'] as string | undefined) ?? 'MEMBER') });
		}
		case '/expire-invites':
			fake.expireInvites(String(body['email'] ?? ''));
			return json({ ok: true });
		case '/link': {
			const token = fake.lastLink(url.searchParams.get('to') ?? '', url.searchParams.get('purpose') ?? '');
			return token === null ? json({ token: null }, 404) : json({ token });
		}
		case '/flags':
			fake.setFlags({ ...STANDARD_FLAGS, ...(body['signedIn'] as object) }, (body['visitor'] as Record<string, unknown>) ?? {});
			return json({ ok: true });
		case '/plans':
			fake.setPlans(body['plans'] as Record<string, unknown>[]);
			return json({ ok: true });
		case '/facts':
			fake.setFacts(body);
			return json({ ok: true });
		case '/usage':
			return json(fake.usage);
		case '/end-sessions': {
			const email = String(body['email'] ?? '');
			const person = fake.person(email);
			for (const session of fake.sessions()) if (person !== undefined && session.user === person.id && !session.ended) fake.endSession(session.id);
			return json({ ok: true });
		}
		case '/requests':
			return json(fake.requests.map((r) => ({ method: r.method, path: r.path })));
		default:
			return json({ error: 'unknown control route' }, 404);
	}
}

Bun.serve({
	port: PORT,
	hostname: '0.0.0.0',
	async fetch(request) {
		const url = new URL(request.url);
		if (request.method === 'OPTIONS') {
			return cors(
				request,
				new Response(null, {
					status: 204,
					headers: {
						'access-control-allow-methods': request.headers.get('access-control-request-method') ?? 'GET',
						'access-control-allow-headers': 'Authorization, Content-Type, Bridge-App, Bridge-Workspace, Idempotency-Key, If-None-Match',
						'access-control-max-age': '600',
					},
				}),
			);
		}
		if (url.pathname.startsWith('/__test/')) return control(url.pathname.slice('/__test'.length), request, url);
		// The fake answers by path; give it the request as Bridge would see it at the fake's origin.
		const forwarded = new Request(`${ORIGIN}${url.pathname}${url.search}`, {
			method: request.method,
			headers: request.headers,
			body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
		});
		return cors(request, await fake.fetch(forwarded));
	},
});

console.log(`fake issuer on ${ORIGIN}/identity-access/apps/${APP_ID}`);
