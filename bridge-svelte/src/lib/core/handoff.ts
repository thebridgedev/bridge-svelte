/**
 * Hand-off mode: a sign-in page that signs a person in for a program on
 * their own machine, such as a command-line tool, instead of for itself.
 *
 * The program opens the page with its PKCE challenge, its loopback address
 * and a `state`:
 *
 *   …/auth/handoff?code_challenge=…&code_challenge_method=S256&redirect_uri=http://127.0.0.1:53123/callback&state=…
 *
 * The page signs in with the program's challenge, never trades the code, and
 * sends the browser to the program's callback with `code`, `state` and `iss`
 * (the issuer it signed in with). Only the program
 * holds the verifier, so only it can trade the code for tokens. The page's
 * own session is never touched.
 *
 * The return address must be `http://127.0.0.1:<port>/callback` or
 * `http://[::1]:<port>/callback`: never `localhost`, another host or another
 * path, so a crafted link cannot send a code off the person's machine or to
 * another service on it.
 */
import {
	handoffReturnUrl,
	readHandoffRequest,
	type Bridge,
	type HandoffRequest,
	type HandoffStep,
	type WorkspaceChoice,
} from '@nebulr-group/bridge-auth-core';

/** Where a hand-off is. */
export type HandoffState =
	| { readonly status: 'ready'; readonly request: HandoffRequest }
	| { readonly status: 'invalid' }
	| { readonly status: 'workspace'; readonly request: HandoffRequest; readonly workspaces: readonly WorkspaceChoice[]; choose(id: string): Promise<HandoffState> }
	| { readonly status: 'done'; readonly request: HandoffRequest; readonly returnUrl: string };

/** Reads the hand-off request from the page's query string. A request that is not safe to answer is `invalid`. */
export function readHandoff(search: string | URLSearchParams): HandoffState {
	try {
		return { status: 'ready', request: readHandoffRequest(search) };
	} catch {
		return { status: 'invalid' };
	}
}

function settle(issuer: string, request: HandoffRequest, step: HandoffStep): HandoffState {
	if (step.done) return { status: 'done', request, returnUrl: handoffReturnUrl(request, step.code, issuer) };
	return {
		status: 'workspace',
		request,
		workspaces: step.workspaces,
		choose: async (id) => settle(issuer, request, await step.choose(id)),
	};
}

/**
 * Signs in for the program. Resolves `done` with the address to send the
 * browser to, or `workspace` when the person must pick one first.
 */
export async function handoffSignIn(
	bridge: Bridge,
	request: HandoffRequest,
	credentials: { readonly email: string; readonly password: string; readonly workspace?: string },
): Promise<HandoffState> {
	const step = await bridge.signIn.handoff({
		email: credentials.email,
		password: credentials.password,
		codeChallenge: request.codeChallenge,
		...(credentials.workspace === undefined ? {} : { workspace: credentials.workspace }),
	});
	return settle(bridge.issuer, request, step);
}

/** Sends the browser back to the program. The address was checked when the request was read. */
export function returnToProgram(state: Extract<HandoffState, { status: 'done' }>): void {
	window.location.assign(state.returnUrl);
}
