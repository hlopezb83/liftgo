import currency from "currency.js";
import { firstBillingPeriod } from "@/lib/domain/firstBillingPeriod";
import { proratedMonthlyCents } from "@/lib/domain/invoiceTotals";
import { bookingClaimOccupiesPeriod, type BookingInvoiceClaim, type InvoiceClaimIndex } from "./originalBookingPeriod";
import type { BillableBooking } from "./bookingCompatibility";

const currencyCode = (value: string | null | undefined) => value?.trim().toUpperCase() || "MXN";

/** Monetary equivalence to today's known monthly rate, not a fabricated rate snapshot. */
export function verifiedRecurringCoverage(booking: BillableBooking, claim: BookingInvoiceClaim,
  claims: BookingInvoiceClaim[], monthlyRate: number | null | undefined, claimsByInvoice?: InvoiceClaimIndex): boolean {
  if (monthlyRate == null || !Number.isFinite(monthlyRate) || monthlyRate < 0) return false;
  const invoiceClaims = claimsByInvoice?.get(claim.invoice_id) ?? claims;
  if (invoiceClaims.some((other) => bookingClaimOccupiesPeriod(other) && other.invoice_id === claim.invoice_id && other.booking_id !== booking.id)) return false;
  if (currencyCode(claim.moneda) !== currencyCode(booking.currency)) return false;
  const start = claim.billing_period_start;
  const end = claim.billing_period_end;
  if (!start || !end || start.slice(0, 7) !== end.slice(0, 7)) return false;
  const period = firstBillingPeriod(start, end);
  if (!period || !Array.isArray(claim.line_items) || claim.line_items.length !== 1) return false;
  const expectedCents = proratedMonthlyCents(monthlyRate, period.billedDays, period.daysInMonth);
  return verifiedRentalLine(claim.line_items[0], expectedCents, period.billedDays);
}

function verifiedRentalLine(line: unknown, expectedCents: number, days: number): boolean {
  if (!line || typeof line !== "object") return false;
  const item = line as Record<string, unknown>;
  if (item.line_kind !== "rental" || (item.discount != null && item.discount !== 0)) return false;
  const { quantity, unit_price: price, total } = item;
  if (typeof quantity !== "number" || typeof price !== "number" || typeof total !== "number") return false;
  if (![quantity, price, total].every(Number.isFinite) || (quantity !== 1 && quantity !== days) || price < 0) return false;
  return currency(total).intValue === expectedCents && currency(quantity * price).intValue === expectedCents;
}
