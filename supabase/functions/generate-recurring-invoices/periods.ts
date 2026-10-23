/** Date-only billing boundaries use UTC components for Monterrey calendar days. */
export function dateOnlyToMty(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fmtMx(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function lastOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

// Hard catch-up limit: at most two years per booking and request.
export const MAX_CATCHUP_ITERATIONS = 24;

export function isBookingEnded(
  endDate: string | null | undefined,
  billingStart: Date,
): boolean {
  return !!endDate && dateOnlyToMty(endDate) < billingStart;
}

/** The first and final cycles retain their inclusive contract boundaries. */
export function nextBillingPeriod(
  lastBilled: string | null,
  startDate: string,
  endDate: string | null | undefined,
): { billingStart: Date; billingEnd: Date; isProrated: boolean } {
  let billingStart: Date;
  let isProrated = false;
  if (lastBilled) {
    const last = dateOnlyToMty(lastBilled);
    billingStart = new Date(
      Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1),
    );
  } else {
    billingStart = dateOnlyToMty(startDate);
    isProrated = billingStart.getUTCDate() !== 1;
  }
  let billingEnd = lastOfMonth(billingStart);
  if (endDate) {
    const contractEnd = dateOnlyToMty(endDate);
    if (contractEnd >= billingStart && contractEnd < billingEnd) {
      billingEnd = contractEnd;
      isProrated = true;
    }
  }
  return { billingStart, billingEnd, isProrated };
}

/** Count months still due after the bounded loop, not after eligibility stops. */
export function pendingPeriodsAfter(
  lastPeriodEnd: string,
  endDate: string | null | undefined,
  today: Date,
): number {
  const last = dateOnlyToMty(lastPeriodEnd);
  const next = new Date(
    Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1),
  );
  const contractEnd = endDate ? dateOnlyToMty(endDate) : today;
  const limit = contractEnd < today ? contractEnd : today;
  if (next > limit) return 0;
  return Math.max(
    1,
    (limit.getUTCFullYear() - next.getUTCFullYear()) * 12 +
      limit.getUTCMonth() - next.getUTCMonth() + 1,
  );
}
