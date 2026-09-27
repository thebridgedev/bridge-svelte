// TBP-703 — a stand-in for the developer's own backend, so the demo can show
// what the browser does when that backend refuses a request at a plan limit.
//
// A real app's backend is a NestJS handler with one decorator:
//
//   @Post() @RequireQuota('tickets', { current: (t, self: TicketsController) => self.tickets.countFor(t.id) })
//   create(...) {}
//
// which, at the cap, answers exactly the 402 below (bridge-nestjs
// @RequireQuota: { statusCode, code, message, metric, used, limit, fix }). This
// demo has no NestJS server, so the endpoint answers as if the workspace were
// already at its cap. The browser side — the part this demo is about — is the
// real SDK reacting to a real HTTP response.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function atCap(metric: string, used: number, limit: number, fix: string) {
	return json(
		{
			statusCode: 402,
			code: 'QUOTA_EXCEEDED',
			message: `Your plan allows ${limit} ${metric}; ${used} are in use.`,
			metric,
			used,
			limit,
			fix
		},
		{ status: 402 }
	);
}

export const POST: RequestHandler = async ({ params }) => {
	switch (params.action) {
		// POST /api/demo-backend/tickets — a gauge at its cap (3 of 3 tickets).
		case 'tickets':
			return atCap('tickets', 3, 3, '/subscription');
		// POST /api/demo-backend/exports — a counter at its cap; its fix names
		// where it came from, to show the dialog follows the backend's link.
		case 'exports':
			return atCap('exports', 10, 10, '/subscription?from=exports');
		// POST /api/demo-backend/card — a 402 that is NOT a plan limit (a card
		// declined upstream). The upgrade dialog must stay shut.
		case 'card':
			return json({ statusCode: 402, code: 'CARD_DECLINED', message: 'Your card was declined' }, { status: 402 });
		// POST /api/demo-backend/ok — the backend accepted the request.
		case 'ok':
			return json({ id: crypto.randomUUID() }, { status: 201 });
		default:
			return json({ message: 'Not found' }, { status: 404 });
	}
};
