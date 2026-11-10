// The SDK's own `bridge.flag_evaluations` count, summed before it is queued.
// Ported from bridge-react / bridge-nextjs (TBP-942).
//
// auth-core's flag client reports `bridge.flag_evaluations` once per
// evaluation, into the same usage queue the app's `bridge.usage.report()`
// uses. That queue sends 10 events a second, oldest first. A page that reads a
// few flags queues hundreds of evaluation events, and the app's own report — the one a `<QuotaGate>` waits
// for — reached Bridge many seconds later. The gate stayed open and a Free
// workspace could go past its limit until a reload.
//
// So evaluations are added up here and handed to the queue as one event per
// metric per window, with the summed value. Bridge counts exactly as many
// evaluations as before; the app's reports are never stuck behind them.

/** The part of auth-core's usage reporter the flag client calls. */
export interface UsageReportTarget {
  report(metric: string, value?: number, idempotencyKey?: string): void;
}

/** How long evaluations are added up before one event is queued. */
export const EVALUATION_COUNT_WINDOW_MS = 1000;

export interface CoalescedUsageReporter extends UsageReportTarget {
  /** Queue whatever has been added up so far, now. */
  flush(): void;
  /** Flush, and stop listening for the page being hidden. Idempotent. */
  stop(): void;
}

/**
 * Wrap `target` so repeated reports of the same metric within
 * `windowMs` reach it as one report carrying the sum. Reports that carry their
 * own idempotency key are passed through unchanged (they name one event).
 * What has been added up is also flushed when the page is hidden or closed.
 */
export function coalesceUsageReports(
  target: UsageReportTarget,
  windowMs: number = EVALUATION_COUNT_WINDOW_MS,
): CoalescedUsageReporter {
  const pending = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending.size === 0) return;
    const sums = [...pending];
    pending.clear();
    for (const [metric, value] of sums) {
      try {
        target.report(metric, value);
      } catch {
        // A usage count must never break a flag read.
      }
    }
  };

  const onHidden = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') return;
    flush();
  };
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  const doc = typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document : null;
  win?.addEventListener('pagehide', flush);
  doc?.addEventListener('visibilitychange', onHidden);

  return {
    report(metric: string, value: number = 1, idempotencyKey?: string): void {
      if (stopped || idempotencyKey !== undefined) {
        target.report(metric, value, idempotencyKey);
        return;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      pending.set(metric, (pending.get(metric) ?? 0) + value);
      if (timer === undefined) {
        timer = setTimeout(flush, windowMs);
        const t = timer as unknown as { unref?: () => void };
        if (typeof t.unref === 'function') t.unref();
      }
    },
    flush,
    stop(): void {
      if (stopped) return;
      stopped = true;
      flush();
      win?.removeEventListener('pagehide', flush);
      doc?.removeEventListener('visibilitychange', onHidden);
    },
  };
}
