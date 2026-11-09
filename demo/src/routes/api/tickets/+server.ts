// The app's own API: the caller must be signed in, and each ticket is counted
// against the workspace's plan ("count this").
import { json } from '@sveltejs/kit';
import { meter, requireActor } from '@nebulr-group/bridge-svelte/server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const actor = requireActor(event);
	meter(event, 'tickets');
	return json({ id: crypto.randomUUID(), workspace: actor.workspaceId }, { status: 201 });
};
