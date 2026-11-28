/**
 * The signed-in person's connected tools: their sessions of an AI assistant or of the app's command-line tool, from
 * Identity and Access's `GET /identity-access/sessions`. auth-core's `sessions.list()` passes the server's
 * answer through; its type does not name the fields a newer server adds, so they are read here.
 */

/** One session as a newer server lists it (`kind`, `client`, `workspace`, `delete` are absent from an older one). */
export interface ListedSession {
	readonly id: string;
	readonly current?: boolean;
	readonly signedInAt: string;
	readonly lastUsedAt: string | null;
	readonly methods?: readonly string[];
	readonly kind?: 'browser' | 'cli' | 'assistant' | string;
	readonly clientId?: string | null;
	readonly client?: { readonly id: string; readonly name: string } | null;
	readonly workspace?: { readonly id: string; readonly name: string } | null;
	readonly delete?: boolean;
}

/** One connected tool as the section shows it. */
export interface ToolRow {
	readonly id: string;
	readonly name: string;
	readonly kind: 'cli' | 'assistant';
	readonly workspace: string | null;
	readonly signedInAt: string;
	readonly lastUsedAt: string | null;
}

/**
 * The tools among the sessions, newest first; null when the server does not say which sessions are tools (an older
 * server): the section is then not shown.
 */
export function toolRows(sessions: readonly ListedSession[]): ToolRow[] | null {
	if (sessions.some((each) => typeof each.kind !== 'string')) return null;
	return sessions
		.filter((each): each is ListedSession & { kind: 'cli' | 'assistant' } => each.kind === 'cli' || each.kind === 'assistant')
		.map((each) => ({
			id: each.id,
			name: each.client?.name ?? each.clientId ?? each.kind,
			kind: each.kind,
			workspace: each.workspace?.name ?? null,
			signedInAt: each.signedInAt,
			lastUsedAt: each.lastUsedAt ?? null
		}))
		.sort((a, b) => (a.signedInAt < b.signedInAt ? 1 : a.signedInAt > b.signedInAt ? -1 : 0));
}

/** The list once one tool is disconnected. */
export function withoutTool(rows: readonly ToolRow[], id: string): ToolRow[] {
	return rows.filter((each) => each.id !== id);
}
