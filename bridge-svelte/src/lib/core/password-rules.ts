/**
 * The app's password rules as a checklist, shown before anyone types and ticked as they type. Bridge checks every
 * rule again when the password is saved; the common-password list and the app's name are checked only there, so the
 * checklist names them without a tick.
 */
import type { PasswordRules } from '@nebulr-group/bridge-auth-core';
import type { PluginMessageKey } from './messages.js';

/** Each rule's line, by the name Bridge gives a rule a password broke (`failed`). */
export const RULE_KEYS: Readonly<Record<string, PluginMessageKey>> = {
	minLength: 'rules.minLength',
	requireUpper: 'rules.upper',
	requireLower: 'rules.lower',
	requireDigit: 'rules.digit',
	requireSymbol: 'rules.symbol',
	blockEmail: 'rules.email',
	blockCommon: 'rules.common',
	blockAppName: 'rules.appName',
};

export interface ChecklistItem {
	readonly rule: keyof typeof RULE_KEYS;
	readonly key: PluginMessageKey;
	readonly vars?: Readonly<Record<string, number>>;
	/** Whether the password typed meets it; null for a rule only Bridge can check, or one that needs the address when none is known. */
	readonly met: boolean | null;
}

/** The checklist for `rules` and what is typed: in Bridge's order, as NFKC counts characters. */
export function checklistOf(rules: PasswordRules | null | undefined, password: string, email: string | null = null): ChecklistItem[] {
	const minLength = rules?.minLength ?? 8;
	const normal = password.normalize('NFKC');
	const items: ChecklistItem[] = [{ rule: 'minLength', key: RULE_KEYS['minLength'] as PluginMessageKey, vars: { count: minLength }, met: [...normal].length >= minLength }];
	const add = (rule: string, met: boolean | null) => items.push({ rule, key: RULE_KEYS[rule] as PluginMessageKey, met });
	if (rules?.requireUpper) add('requireUpper', /\p{Lu}/u.test(normal));
	if (rules?.requireLower) add('requireLower', /\p{Ll}/u.test(normal));
	if (rules?.requireDigit) add('requireDigit', /\p{N}/u.test(normal));
	if (rules?.requireSymbol) add('requireSymbol', /[^\p{L}\p{N}]/u.test(normal));
	if (rules?.blockEmail) {
		const address = email?.trim().toLowerCase() ?? '';
		const local = address.split('@')[0] ?? '';
		const lower = normal.toLowerCase();
		add('blockEmail', address === '' || !address.includes('@') ? null : normal === '' ? false : !(lower.includes(address) || (local.length >= 3 && lower.includes(local))));
	}
	if (rules?.blockCommon) add('blockCommon', null);
	if (rules?.blockAppName) add('blockAppName', null);
	return items;
}

/** Whether every rule the page can check is met: the form is sent only then, and Bridge checks the rest. */
export function checklistMet(items: readonly ChecklistItem[]): boolean {
	return items.every((item) => item.met !== false);
}
