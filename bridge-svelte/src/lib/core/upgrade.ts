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
 * shapes server plugins answer with: `{ code: 'QUOTA_EXCEEDED', metric, used,
 * limit, fix }` for a limit, and `{ code: 'FEATURE_NOT_IN_PLAN', flag,
 * feature, fix }` for a flag that is off because the plan lacks a feature.
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
	if (code === 'FEATURE_NOT_IN_PLAN') {
		return { kind: 'feature', entitlement: str(b['feature']) ?? str(b['entitlement']), flag: str(b['flag']), message, upgradeHref };
	}
	return null;
}

/** A plan limit your API refused: the 402 `QUOTA_EXCEEDED` answer, for code that wants to show something other than the dialog. */
export interface BridgeQuotaRefusal {
	/** The metric the plan ran out of, such as `tickets`. */
	readonly metric: string;
	/** How much was used when the request was refused, if the API said. */
	readonly used: number | null;
	/** The plan's limit, if the API said. */
	readonly limit: number | null;
	/** Where the refusal said to upgrade, when it named a page of this app; else null. */
	readonly fix: string | null;
	/** The API's own words, if it sent some. */
	readonly message: string | null;
	/** The address of the request that was refused. */
	readonly url: string;
}

/** The refusal in a 402 body, or null when the body is not a plan limit (a declined card, a missing plan feature). */
export function parseQuotaRefusal(body: unknown, url = ''): BridgeQuotaRefusal | null {
	const request = readPaymentRequired(body);
	if (request === null || request.kind !== 'limit' || request.metric === null || request.metric === undefined) return null;
	return { metric: request.metric, used: request.used ?? null, limit: request.limit ?? null, fix: request.upgradeHref ?? null, message: request.message ?? null, url };
}

type QuotaListener = (refusal: BridgeQuotaRefusal) => void;
const listeners = new Set<QuotaListener>();

/**
 * Runs `handler` each time your API refuses a request at a plan limit, through `bridgeFetch`: for an app that turned the
 * dialog off (`billing.upgradeDialog: false`) and shows its own. Returns how to stop.
 */
export function onBridgeQuotaExceeded(handler: QuotaListener): () => void {
	listeners.add(handler);
	return () => {
		listeners.delete(handler);
	};
}

/** Tells the listeners of one refusal. A broken listener stops neither the others nor the dialog. */
export function reportQuotaRefusal(refusal: BridgeQuotaRefusal): void {
	for (const listener of [...listeners]) {
		try {
			listener(refusal);
		} catch {
			// One listener's mistake is its own.
		}
	}
}
