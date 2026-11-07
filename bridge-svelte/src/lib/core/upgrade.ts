/**
 * The upgrade dialog: opened by a plan limit your API refused (a 402 through
 * `bridgeFetch`) or by an upgrade prompt on a feature that is off because of
 * the plan. `<BridgeBootstrap>` renders it.
 */
import { sanitizeReturnTo } from '@nebulr-group/bridge-auth-core';
import { writable, type Readable } from 'svelte/store';

/** Why the dialog is open. */
export interface UpgradeRequest {
	/** `limit`: a usage limit was reached. `feature`: the plan does not include a feature. */
	readonly kind: 'limit' | 'feature';
	/** The metric whose limit was reached. */
	readonly metric?: string | null;
	readonly used?: number | null;
	readonly limit?: number | null;
	/** The plan feature that is missing. */
	readonly entitlement?: string | null;
	/** The flag that is off, when an upgrade prompt opened the dialog. */
	readonly flag?: string | null;
	/** The refusal's own words, when it had some. */
	readonly message?: string | null;
	/** Where the refusal said to go to upgrade, when it named a page of this app. */
	readonly upgradeHref?: string | null;
}

export interface UpgradeDialogProps {
	readonly request: UpgradeRequest;
	/** The plan page. */
	readonly upgradeHref: string;
	/** Whether this person may change the plan: the `billingManage` flag. */
	readonly canUpgrade: boolean;
	readonly onclose: () => void;
}

const current = writable<UpgradeRequest | null>(null);

/** The open request, or null. */
export const upgradeRequest: Readable<UpgradeRequest | null> = { subscribe: current.subscribe };

/** Opens the upgrade dialog. Call it from a click, never on render. */
export function openUpgrade(request: UpgradeRequest): void {
	current.set(request);
}

export function closeUpgrade(): void {
	current.set(null);
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** A same-origin path only, through the same check as return addresses: a refusal's link never sends the person elsewhere. */
function samePath(value: unknown): string | null {
	return typeof value === 'string' ? sanitizeReturnTo(value) : null;
}

/**
 * Reads a 402 answer's body. A plan limit or a missing plan feature opens
 * the dialog; any other 402, such as a declined card, does not.
 *
 * Understood: problem details (`type` ending in `plan-required` or
 * `quota-exceeded`, with `entitlement`, `metric`, `used`, `limit`), and the
 * `{ code: 'QUOTA_EXCEEDED', metric, used, limit, fix }` shape server
 * plugins answer a limit with.
 */
export function readPaymentRequired(body: unknown): UpgradeRequest | null {
	if (body === null || typeof body !== 'object') return null;
	const b = body as Record<string, unknown>;
	const type = str(b['type']) ?? '';
	const code = (str(b['code']) ?? '').toUpperCase();
	const message = str(b['detail']) ?? str(b['message']);
	const upgradeHref = samePath(b['fix']) ?? samePath(b['upgrade']);
	if (code === 'QUOTA_EXCEEDED' || type.endsWith('quota-exceeded') || type.endsWith('limit-reached')) {
		return { kind: 'limit', metric: str(b['metric']), used: num(b['used']), limit: num(b['limit']), message, upgradeHref };
	}
	if (code === 'PLAN_REQUIRED' || type.endsWith('plan-required')) {
		return { kind: 'feature', entitlement: str(b['entitlement']), message, upgradeHref };
	}
	return null;
}
