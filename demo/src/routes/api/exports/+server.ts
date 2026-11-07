// A stand-in for an API that refuses at a plan limit. A real server plugin
// answers this exact 402 at the cap; the browser side is what the demo shows.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () =>
	json(
		{ code: 'QUOTA_EXCEEDED', message: 'Your plan allows 10 exports this month.', metric: 'exports', used: 10, limit: 10, fix: '/subscription' },
		{ status: 402 }
	);
