import type { ReturnBillingEvidence } from "./completedRecurringBooking";
import type { BillingExtension, BookingInvoiceClaim, InvoiceClaimIndex } from "./originalBookingPeriod";

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** Build each lookup once while retaining every booking linked to an invoice. */
export function indexBillingEvidence(
  claims: BookingInvoiceClaim[],
  extensions: BillingExtension[],
  returns: ReturnBillingEvidence[],
  forklifts: { id: string; monthly_rate?: number | null }[] = [],
) {
  const claimsByInvoice: InvoiceClaimIndex = groupBy(claims, (claim) => claim.invoice_id);
  return {
    claimsByBooking: groupBy(claims, (claim) => claim.booking_id),
    claimsByInvoice,
    extensionsByBooking: groupBy(extensions, (extension) => extension.booking_id),
    returnsByBooking: groupBy(returns, (returned) => returned.booking_id),
    monthlyRateByForklift: new Map(forklifts.map((forklift) => [forklift.id, forklift.monthly_rate])),
    returnTimes: returns.map((returned) => Date.parse(returned.inspected_at)),
  };
}

export type BillingEvidenceIndex = ReturnType<typeof indexBillingEvidence>;
