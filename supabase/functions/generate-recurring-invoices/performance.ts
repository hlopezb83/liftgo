/** Request-local diagnostics. No caller values, identities, payloads or errors. */
const phases = [
  "auth_cron",
  "auth_user",
  "auth_org",
  "bookings",
  "fiscal",
  "history_linked",
  "history_direct",
  "charges",
  "plan",
  "serialize",
] as const;
const counters = [
  "bookings_rows",
  "fiscal_rows",
  "history_linked_rows",
  "history_direct_rows",
  "quote_ids",
  "read_pages",
  "charge_batches",
  "preview_lines",
  "eligible_lines",
  "pending_periods",
] as const;

export type RecurringPhase = typeof phases[number];
export type RecurringCounter = typeof counters[number];
export type RecurringPerformanceSnapshot = {
  event: "recurring_preview_performance";
  traceId: string;
  outcome: "ok" | "error";
  totalMs: number;
  phases: Partial<Record<RecurringPhase, { calls: number; ms: number }>>;
  counts: Partial<Record<RecurringCounter, number>>;
};
export interface RecurringPerformance {
  measure<T>(
    phase: RecurringPhase,
    operation: () => PromiseLike<T>,
  ): Promise<T>;
  count(counter: RecurringCounter, amount: number): void;
  finish(outcome: "ok" | "error"): { serverTiming: string; traceId: string };
}

/** Durations include client/transport/lock waits, not only SQL execution. */
export function createRecurringPerformance(options: {
  now?: () => number;
  emit?: (snapshot: RecurringPerformanceSnapshot) => void;
} = {}): RecurringPerformance {
  const traceId = crypto.randomUUID();
  const now = options.now ?? (() => performance.now());
  const emit = options.emit ??
    ((snapshot) =>
      console.info(
        "[recurring-preview-performance]",
        JSON.stringify(snapshot),
      ));
  let lastClock = 0;
  const clock = () => {
    try {
      const value = now();
      if (Number.isFinite(value)) lastClock = Math.max(lastClock, value);
    } catch { /* Diagnostics must not change a billing outcome. */ }
    return lastClock;
  };
  const start = clock();
  const timings = new Map<RecurringPhase, { calls: number; ms: number }>();
  const totals = new Map<RecurringCounter, number>();
  let result: { serverTiming: string; traceId: string } | undefined;
  const rounded = (value: number) => Math.round(value * 10) / 10;

  return {
    async measure<T>(phase: RecurringPhase, operation: () => PromiseLike<T>) {
      const before = clock();
      try {
        return await operation();
      } finally {
        // Runtime allowlist also prevents accidental labels from leaking data.
        if (!result && phases.includes(phase)) {
          const timing = timings.get(phase) ?? { calls: 0, ms: 0 };
          timings.set(phase, {
            calls: timing.calls + 1,
            ms: timing.ms + clock() - before,
          });
        }
      }
    },
    count(counter, amount) {
      if (
        result || !counters.includes(counter) ||
        !Number.isSafeInteger(amount) || amount < 0
      ) return;
      totals.set(
        counter,
        Math.min(Number.MAX_SAFE_INTEGER, (totals.get(counter) ?? 0) + amount),
      );
    },
    finish(outcome) {
      if (result) return result;
      const totalMs = rounded(clock() - start);
      const measured = phases.flatMap((phase) => {
        const timing = timings.get(phase);
        return timing
          ? [[phase, { calls: timing.calls, ms: rounded(timing.ms) }] as const]
          : [];
      });
      result = {
        traceId,
        serverTiming: [
          ...measured.map(([phase, timing]) => `${phase};dur=${timing.ms}`),
          `total;dur=${totalMs}`,
        ].join(", "),
      };
      try {
        emit({
          event: "recurring_preview_performance",
          traceId,
          outcome: outcome === "ok" ? "ok" : "error",
          totalMs,
          phases: Object.fromEntries(measured),
          counts: Object.fromEntries(
            counters.filter((counter) => totals.has(counter)).map((
              counter,
            ) => [counter, totals.get(counter)!]),
          ),
        });
      } catch {
        /* A logging outage must not fail an otherwise valid preview. */
      }
      return result;
    },
  };
}
