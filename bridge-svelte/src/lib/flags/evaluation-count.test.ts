// Flag-evaluation counts are summed before they reach the shared usage queue,
// so the app's own `bridge.usage.report()` is not stuck behind them (TBP-942 port).
import { describe, it, expect } from 'vitest';
import { coalesceUsageReports } from './evaluation-count.js';

type Call = [string, number | undefined, string | undefined];

describe('coalesceUsageReports', () => {
	it('many reports of one metric reach the queue as one report carrying the sum', async () => {
		const seen: Call[] = [];
		const counter = coalesceUsageReports({ report: (m, v, k) => void seen.push([m, v, k]) }, 20);
		for (let i = 0; i < 250; i++) counter.report('bridge.flag_evaluations', 1);
		expect(seen).toEqual([]);
		await new Promise((r) => setTimeout(r, 60));
		expect(seen).toEqual([['bridge.flag_evaluations', 250, undefined]]);
		counter.stop();
	});

	it('a report with its own idempotency key passes straight through', () => {
		const seen: Call[] = [];
		const counter = coalesceUsageReports({ report: (m, v, k) => void seen.push([m, v, k]) }, 60_000);
		counter.report('qr_codes', 1, 'key-1');
		expect(seen).toEqual([['qr_codes', 1, 'key-1']]);
		counter.stop();
	});

	it('what has been added up is queued when the bundle stops', () => {
		const seen: Call[] = [];
		const counter = coalesceUsageReports({ report: (m, v, k) => void seen.push([m, v, k]) }, 60_000);
		counter.report('bridge.flag_evaluations', 1);
		counter.report('bridge.flag_evaluations', 2);
		counter.stop();
		expect(seen).toEqual([['bridge.flag_evaluations', 3, undefined]]);
	});

	it('the app report is not queued behind a burst of evaluations', () => {
		// The real queue: one event per report, oldest first.
		const queue: string[] = [];
		const counter = coalesceUsageReports({ report: (m) => void queue.push(m) }, 60_000);
		for (let i = 0; i < 600; i++) counter.report('bridge.flag_evaluations', 1);
		queue.push('qr_codes'); // what bridge.usage.report('qr_codes') enqueues directly
		expect(queue).toEqual(['qr_codes']);
		counter.stop();
		expect(queue).toEqual(['qr_codes', 'bridge.flag_evaluations']);
	});
});
