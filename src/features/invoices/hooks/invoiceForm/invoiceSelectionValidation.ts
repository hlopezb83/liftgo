import type { QuotedRentalBooking } from "@/features/quotes";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { hasLegacyVat } from "@/lib/fiscal/legacyVat";
import { nowMty } from "@/lib/utils";
import {
  lateRecoverySelectionError,
  periodOutsideBookingsError,
  validateBookingSelection,
  type BillableBooking,
} from "../../lib/bookingCompatibility";
import { createInvoiceFormSchema, type InvoiceFormValues } from "../../lib/invoiceFormSchema";
import { bookingPeriodSelectionError, type BookingInvoiceClaim } from "../../lib/originalBookingPeriod";
import { quoteChargeSelectionError, type QuoteChargeAvailability } from "../../lib/quoteChargeAvailability";
import { quotedBillingPeriodError, type BookingQuoteSource } from "../../lib/quotedBookingLines";
import { buildFromInvoice, type ExistingInvoice } from "./invoiceFormBuilders";
import type { useExtensionPrefill } from "../useExtensionPrefill";

interface SaleAssignmentGuard {
  shouldBlock: boolean;
  totalAssigned: number;
  totalRequired: number;
  missingByLine: Array<{ index: number; description: string; assigned: number; required: number }>;
}

interface QuoteAssignmentStatus {
  isComplete: boolean;
  totalAssigned: number;
  totalRequired: number;
  missingByLine: SaleAssignmentGuard["missingByLine"];
}

export type InvoiceSelectionValidationError = {
  field: "bookingIds" | "billingPeriodStart" | "lineItems";
  message: string;
};

type SelectableBillingBooking = BillableBooking & QuotedRentalBooking;

export interface InvoiceSelectionValidationContext<TBooking extends SelectableBillingBooking = SelectableBillingBooking> {
  isEdit: boolean;
  id?: string;
  extensionId: string | null;
  extension: ReturnType<typeof useExtensionPrefill>["extension"];
  candidatesBlock: string | null;
  chargeBlock: string | null;
  relatedQuoteIds: string[];
  chargeAvailabilityData: QuoteChargeAvailability | undefined;
  periods: {
    billingBookings: TBooking[] | undefined;
    claims: BookingInvoiceClaim[];
    linkedBlock: (ids: string[] | undefined) => string | null;
  };
  bookingSourceQuotes: BookingQuoteSource[] | undefined;
}

type ExistingInvoiceSnapshot = ExistingInvoice & {
  subtotal: number;
  tax_amount: number;
  total: number;
};

/** Ids únicos de cotización referenciados por las reservas. */
export function collectBookingQuoteIds(bookings?: { quote_id?: string | null }[]): string[] {
  const set = new Set<string>();
  bookings?.forEach((b) => {
    if (b.quote_id) set.add(b.quote_id);
  });
  return Array.from(set);
}

/** Bloquea facturar una venta cuando faltan unidades asignadas a la cotización. */
export function buildSaleAssignmentGuard(
  status: QuoteAssignmentStatus,
  opts: { isEdit: boolean; fromQuoteId: string | null; quoteType?: string },
): SaleAssignmentGuard {
  const isPendingSale = !opts.isEdit && !!opts.fromQuoteId && opts.quoteType === "sale";
  return {
    shouldBlock: isPendingSale && !status.isComplete,
    totalAssigned: status.totalAssigned,
    totalRequired: status.totalRequired,
    missingByLine: status.missingByLine,
  };
}

export function toQuoteLineItems(sourceQuote?: { line_items?: unknown } | null): LineItem[] {
  return Array.isArray(sourceQuote?.line_items)
    ? (sourceQuote.line_items as unknown as LineItem[])
    : [];
}

export function invoiceSchemaForEdit(isEdit: boolean, existing: ExistingInvoice | null | undefined) {
  return createInvoiceFormSchema(isEdit && existing ? buildFromInvoice(existing, undefined) : undefined);
}

export function applyLegacyVatSnapshotIfUnchanged<T extends Record<string, unknown>>(
  payload: T,
  values: InvoiceFormValues,
  isEdit: boolean,
  existing: ExistingInvoiceSnapshot | null | undefined,
): T {
  // An unchanged historical fiscal snapshot must not be reserialized/recalculated.
  if (isEdit && existing && hasLegacyVat({ tax_rate: values.taxRate, line_items: values.lineItems })) {
    return {
      ...payload,
      line_items: existing.line_items,
      tax_rate: existing.tax_rate,
      subtotal: existing.subtotal,
      tax_amount: existing.tax_amount,
      total: existing.total,
    };
  }
  return payload;
}

function selectedCandidateBlock(ids: string[] | undefined, block: string | null) {
  return ids?.length ? block : null;
}

function selectedBillingBookings<TBooking extends BillableBooking>(
  ids: string[] | undefined,
  bookings: TBooking[] | undefined,
): TBooking[] {
  return (ids ?? []).flatMap((id) => bookings?.find((booking) => booking.id === id) ?? []);
}

function validateNewInvoiceRules<TBooking extends SelectableBillingBooking>(
  values: InvoiceFormValues,
  selected: TBooking[],
  ctx: InvoiceSelectionValidationContext<TBooking>,
): InvoiceSelectionValidationError | null {
  if (ctx.isEdit) return null;
  const lateError = lateRecoverySelectionError(selected, values.lineItems);
  if (lateError) return { field: "lineItems", message: lateError };
  if (selected.length === 0) return null;
  const quoted = (values.bookingIds ?? []).flatMap(
    (bid) => ctx.periods.billingBookings?.find((booking) => booking.id === bid) ?? [],
  );
  const pactError = quotedBillingPeriodError(
    quoted,
    ctx.bookingSourceQuotes,
    values.billingPeriodStart,
    values.billingPeriodEnd,
    { requestedId: ctx.extensionId, loaded: ctx.extension },
  );
  return pactError ? { field: "billingPeriodStart", message: pactError } : null;
}

function validateSelectedBookingRange(
  values: InvoiceFormValues,
  selected: BillableBooking[],
): InvoiceSelectionValidationError | null {
  const issue = values.issueDate ?? nowMty();
  const mix = validateBookingSelection(selected, issue);
  if (mix) return { field: "bookingIds", message: mix };
  const range = periodOutsideBookingsError(
    selected,
    values.billingPeriodStart,
    values.billingPeriodEnd,
  );
  return range ? { field: "billingPeriodStart", message: range } : null;
}

/**
 * Regresión v7.423.0 (P2/P3): validación al GUARDAR — no depende del filtro
 * visual del selector. Reglas: (a) las reservas seleccionadas deben ser
 * compatibles entre sí (cliente, moneda/TC, mismo periodo canónico) y
 * (b) el periodo capturado debe caber en el rango de TODAS. El servidor
 * re-valida lo mismo dentro del RPC transaccional (autoridad final).
 */
export function validateInvoiceSelection<TBooking extends SelectableBillingBooking>(
  values: InvoiceFormValues,
  ctx: InvoiceSelectionValidationContext<TBooking>,
): InvoiceSelectionValidationError | null {
  const candidateError = selectedCandidateBlock(values.bookingIds, ctx.candidatesBlock);
  if (candidateError) return { field: "bookingIds", message: candidateError };
  const chargeError =
    ctx.chargeBlock ||
    quoteChargeSelectionError(ctx.relatedQuoteIds, values.lineItems, ctx.chargeAvailabilityData);
  if (chargeError) return { field: "lineItems", message: chargeError };
  const selected = selectedBillingBookings(values.bookingIds, ctx.periods.billingBookings);
  const periodError = bookingPeriodSelectionError(
    values.bookingIds ?? [],
    selected,
    ctx.periods.claims,
    values.billingPeriodStart,
    values.billingPeriodEnd,
    ctx.periods.linkedBlock(values.bookingIds),
    ctx.id,
  );
  if (periodError) return periodError;
  const newInvoiceError = validateNewInvoiceRules(values, selected, ctx);
  if (newInvoiceError) return newInvoiceError;
  if (selected.length === 0) return null;
  return validateSelectedBookingRange(values, selected);
}
