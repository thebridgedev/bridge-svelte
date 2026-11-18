/** What `QuotaBanner` says, as a pure decision: where a quota sits, and the words for it. */
import type { QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { warningOf } from '../../core/quota.js';

export type QuotaBannerState = 'hidden' | 'approaching' | 'critical' | 'reached' | 'over' | 'metered';

export interface QuotaBannerCopy {
	readonly title: string;
	readonly body: string;
	readonly cta?: string;
}

const OWNER = 'Contact your workspace owner.';

/** Where a snapshot sits. A metered quota bills instead of blocking and keeps its own words; exactly at a hard limit is `reached`, not "approaching". */
export function quotaBannerState(snapshot: QuotaSnapshot | undefined | null): QuotaBannerState {
	if (snapshot === undefined || snapshot === null) return 'hidden';
	const level = warningOf(snapshot);
	if (snapshot.policy === 'metered') return level !== null || (snapshot.overcap ?? snapshot.used > snapshot.limit) ? 'metered' : 'hidden';
	if (snapshot.limit > 0 && snapshot.used > snapshot.limit) return 'over';
	if (snapshot.limit > 0 && snapshot.used >= snapshot.limit) return 'reached';
	return level === 'critical' ? 'critical' : level === 'approaching' ? 'approaching' : 'hidden';
}

/** An amount of money as `$1.00` or `1.00 SEK`. */
export function formatCost(amount: number | undefined, currency: string | undefined): string {
	if (amount === undefined) return '';
	const code = (currency ?? '').toUpperCase();
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: code || 'USD' }).format(amount);
	} catch {
		return `${amount.toFixed(2)}${code ? ` ${code}` : ''}`;
	}
}

function memberBody(label: string, state: 'over' | 'reached' | 'critical' | 'approaching'): string {
	switch (state) {
		case 'over':
			return `Your workspace is over its ${label} cap. ${OWNER}`;
		case 'reached':
			return `Your workspace has reached its ${label} limit. ${OWNER}`;
		case 'critical':
			return `Your workspace is approaching its ${label} cap. ${OWNER}`;
		case 'approaching':
			return `Your workspace is approaching its ${label} cap.`;
	}
}

export function quotaBannerCopy(snapshot: QuotaSnapshot | undefined | null, admin: boolean, label: string): QuotaBannerCopy {
	const state = quotaBannerState(snapshot);
	if (snapshot === undefined || snapshot === null || state === 'hidden') return { title: '', body: '' };

	if (state === 'metered') {
		const over = snapshot.limit > 0 ? Math.max(0, snapshot.used - snapshot.limit) : snapshot.used;
		const cost = formatCost(snapshot.overageEstimate, snapshot.currency);
		const estimate = cost ? ` · ~${cost} estimated this period` : '';
		if (snapshot.limit > 0) {
			if (over > 0) return { title: `${label} overage`, body: `${over.toLocaleString()} over your ${snapshot.limit.toLocaleString()} included${estimate}.` };
			const unit = formatCost(snapshot.unitAmount, snapshot.currency);
			return {
				title: `${label} approaching included limit`,
				body: `You've used ${snapshot.used.toLocaleString()} of ${snapshot.limit.toLocaleString()} included${unit ? ` — extra usage is billed at ${unit}/unit` : ''}.`,
			};
		}
		return { title: `${label} usage`, body: `${snapshot.used.toLocaleString()} ${label}${estimate}.` };
	}

	const used = snapshot.used.toLocaleString();
	const limit = snapshot.limit.toLocaleString();
	const left = Math.max(0, snapshot.remaining).toLocaleString();
	switch (state) {
		case 'over':
			return admin
				? { title: `${label} over cap`, body: `You've used ${used} of ${limit}. Upgrade your plan to add headroom.`, cta: 'Upgrade' }
				: { title: `${label} over cap`, body: memberBody(label, 'over') };
		case 'reached':
			return admin
				? { title: `${label} limit reached`, body: `You've used all ${limit} on your plan. Upgrade your plan to add more.`, cta: 'Upgrade' }
				: { title: `${label} limit reached`, body: memberBody(label, 'reached') };
		case 'critical':
			return admin
				? { title: `${label} near cap`, body: `You've used ${used} of ${limit} (${left} left). Upgrade to avoid hitting the cap.`, cta: 'Upgrade' }
				: { title: `${label} near cap`, body: memberBody(label, 'critical') };
		default:
			return admin
				? { title: `${label} approaching cap`, body: `You've used ${used} of ${limit} (${left} left).`, cta: 'Upgrade' }
				: { title: `${label} approaching cap`, body: memberBody(label, 'approaching') };
	}
}
