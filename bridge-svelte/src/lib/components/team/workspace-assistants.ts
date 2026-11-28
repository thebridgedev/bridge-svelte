/**
 * "Allow AI assistants" for the current workspace: Accounts' workspace field `assistants` (on unless switched off).
 * Only the workspace's Owner may change it, and Bridge refuses anyone else; the form shows the switch to the Owner only,
 * which is about what to show, not a gate. An older Bridge whose workspace has no such field: no switch.
 */

/** The Owner role, as Accounts names it. */
export const OWNER_ROLE = 'OWNER';

/** The switch's value when it is shown, or null when it is not: the field is absent, or the person is not the Owner. */
export function assistantsSwitch(workspace: { readonly [field: string]: unknown } | null, role: string | null | undefined): boolean | null {
	if (workspace === null || typeof workspace['assistants'] !== 'boolean') return null;
	return role === OWNER_ROLE ? (workspace['assistants'] as boolean) : null;
}
