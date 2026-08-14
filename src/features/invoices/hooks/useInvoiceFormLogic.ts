
import { useForm } from "react-hook-form";
import { useBookings, type BookingWithForklift } from "@/features/bookings";
import { useCustomers } from "@/features/customers";
import { useForklifts, useQuoteAssignments } from "@/features/fleet";
import { useQuote, useQuoteSaleAssignmentStatus, useQuotesByIds } from "@/features/quotes";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { zodResolver } from "@/lib/forms/zodResolver";
import {
  invoiceFormSchema,
  buildEmptyInvoiceValues,
  type InvoiceFormValues,
  type LineItemValues,
} from "../lib/invoiceFormSchema";
import { useInvoiceFormHandlers } from "./invoiceForm/useInvoiceFormHandlers";
import { useInvoiceFormSubmit } from "./invoiceForm/useInvoiceFormSubmit";
import { useInvoiceFormTotals } from "./invoiceForm/useInvoiceFormTotals";
import { useInvoicePrefill } from "./invoiceForm/useInvoicePrefill";
import { useInvoiceBookings, useAllInvoiceBookings } from "./invoices/useInvoiceBookings";
import { useInvoice, useInvoices } from "./invoices/useInvoices";
import { useExtensionPrefill } from "./useExtensionPrefill";

export type { InvoiceFormValues, LineItemValues };

export interface SaleAssignmentGuard {
  shouldBlock: boolean;
  totalAssigned: number;
  totalRequired: number;
  missingByLine: Array<{ index: number; description: string; assigned: number; required: number }>;
}

interface UseInvoiceFormLogicArgs {
  id?: string;
  fromQuoteId: string | null;
  /** v7.307.0: id de `booking_extensions` cuando venimos de "Facturar extensión". */
  extensionId?: string | null;
}

/** Ids únicos de cotización referenciados por las reservas. */
function collectBookingQuoteIds(bookings?: { quote_id?: string | null }[]): string[] {
  const set = new Set<string>();
  bookings?.forEach((b) => {
    if (b.quote_id) set.add(b.quote_id);
  });
  return Array.from(set);
}

/** Reservas que ya están facturadas (por columna directa o por pivote). */
function collectInvoicedBookingIds(
  invoices: { status: string; booking_id?: string | null }[] | undefined,
  allInvoiceBookings: { invoice_id: string; booking_id: string }[] | undefined,
  currentInvoiceId?: string,
): Set<string> {
  const set = new Set<string>();
  invoices?.forEach((inv) => {
    if (inv.status !== "cancelled" && inv.booking_id) set.add(inv.booking_id);
  });
  // Excluye las reservas de la factura que se está editando.
  allInvoiceBookings?.forEach((row) => {
    if (currentInvoiceId && row.invoice_id === currentInvoiceId) return;
    set.add(row.booking_id);
  });
  return set;
}

interface QuoteAssignmentStatus {
  isComplete: boolean;
  totalAssigned: number;
  totalRequired: number;
  missingByLine: SaleAssignmentGuard["missingByLine"];
}

/** Bloquea facturar una venta cuando faltan unidades asignadas a la cotización. */
function buildSaleAssignmentGuard(
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

function toQuoteLineItems(sourceQuote?: { line_items?: unknown } | null): LineItem[] {
  return Array.isArray(sourceQuote?.line_items)
    ? (sourceQuote?.line_items as unknown as LineItem[])
    : [];
}

/** Reservas confirmadas aún no facturadas (+ la de la extensión en curso). */
function filterAvailableBookings(
  bookings: BookingWithForklift[] | undefined,
  invoicedBookingIds: Set<string>,
  extensionBookingId: string | null,
): BookingWithForklift[] | undefined {
  return bookings?.filter(
    (booking) =>
      booking.status === "confirmed" &&
      (!invoicedBookingIds.has(booking.id) || booking.id === extensionBookingId),
  );
}

export function useInvoiceFormLogic({ id, fromQuoteId, extensionId = null }: UseInvoiceFormLogicArgs) {

  const isEdit = !!id;
  const quoteId = fromQuoteId || undefined;

  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: existing } = useInvoice(id);
  const { data: sourceQuote } = useQuote(quoteId);
  const { data: assignments } = useQuoteAssignments(quoteId);
  const { data: invoices } = useInvoices();
  const { data: allInvoiceBookings } = useAllInvoiceBookings();
  const { data: invoiceBookingsRows } = useInvoiceBookings(id);
  const existingBookingIds = (invoiceBookingsRows ?? []).map((r) => r.booking_id);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: buildEmptyInvoiceValues(),
  });

  useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form, existingBookingIds });

  const quoteAssignmentStatus = useQuoteSaleAssignmentStatus(
    quoteId,
    toQuoteLineItems(sourceQuote),
  );

  const saleAssignmentGuard = buildSaleAssignmentGuard(quoteAssignmentStatus, {
    isEdit,
    fromQuoteId,
    quoteType: sourceQuote?.quote_type,
  });

  const submit = useInvoiceFormSubmit();
  const uniqueBookingQuoteIds = collectBookingQuoteIds(bookings);
  const { data: bookingSourceQuotes } = useQuotesByIds(uniqueBookingQuoteIds);
  const { handleCustomerSelect, handleBookingSelect, handleBookingsChange } = useInvoiceFormHandlers({ form, customers, bookings, forklifts, quotes: bookingSourceQuotes });
  const totals = useInvoiceFormTotals(form);

  const invoicedBookingIds = collectInvoicedBookingIds(
    invoices,
    allInvoiceBookings,
    isEdit ? id : undefined,
  );

  // v7.307.0: al facturar una extensión, la reserva YA tiene factura del
  // período original. Se re-habilita para poder ligar la factura del tramo
  // extendido; el doble cobro lo evita el guard de `booking_extensions`.
  const { extension } = useExtensionPrefill({
    isEdit,
    extensionId,
    customersLoaded: (customers?.length ?? 0) > 0,
    form,
    handleCustomerSelect,
  });
  const extensionBookingId = extension?.booking_id ?? null;

  const availableBookings = filterAvailableBookings(
    bookings as BookingWithForklift[] | undefined,
    invoicedBookingIds,
    extensionBookingId,
  );

  const onSubmit = (values: InvoiceFormValues) => submit.buildPayload({
    values, isEdit, fromQuoteId,
    existingBookingId: existing?.booking_id,
    existingQuoteId: existing?.quote_id,
  });

  return {
    form, isEdit, id, fromQuoteId,
    invoiceNumber: existing?.invoice_number ?? null,
    customers, availableBookings,
    sourceQuote,
    saleAssignmentGuard,
    extension,
    handleCustomerSelect, handleBookingSelect, handleBookingsChange,
    onSubmit,
    createInvoice: submit.createInvoice,
    updateInvoice: submit.updateInvoice,
    updateQuote: submit.updateQuote,
    syncInvoiceBookings: submit.syncInvoiceBookings,
    subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total,
    isPending: submit.isPending,
  };
}

