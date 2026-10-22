
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useBookings, type BookingWithForklift } from "@/features/bookings";
import { useCustomers } from "@/features/customers";
import { useForklifts, useQuoteAssignments } from "@/features/fleet";
import { useQuote, useQuoteSaleAssignmentStatus, useQuotesByIds } from "@/features/quotes";
import { useInitialRecordVersion } from "@/hooks/useInitialRecordVersion";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { hasLegacyVat } from "@/lib/fiscal/legacyVat";
import { zodResolver } from "@/lib/forms/zodResolver";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { nowMty } from "@/lib/utils";
import { lateRecoverySelectionError } from "../lib/bookingCompatibility";
import {
  periodOutsideBookingsError,
  validateBookingSelection,
  type BillableBooking,
} from "../lib/bookingCompatibility";
import {
  createInvoiceFormSchema,
  buildEmptyInvoiceValues,
  type InvoiceFormValues,

} from "../lib/invoiceFormSchema";
import { bookingPeriodSelectionError } from "../lib/originalBookingPeriod";
import { quoteChargeSelectionError } from "../lib/quoteChargeAvailability";
import { quotedBillingPeriodError } from "../lib/quotedBookingLines";
import { buildFromInvoice, type ExistingInvoice } from "./invoiceForm/invoiceFormBuilders";
import { useInvoiceBookingPeriods } from "./invoiceForm/useInvoiceBookingPeriods";
import { useInvoiceFormHandlers } from "./invoiceForm/useInvoiceFormHandlers";
import { useInvoiceFormSubmit } from "./invoiceForm/useInvoiceFormSubmit";
import { useInvoiceFormTotals } from "./invoiceForm/useInvoiceFormTotals";
import { useInvoicePrefill } from "./invoiceForm/useInvoicePrefill";
import { invoiceChargeBlock, useInvoiceQuoteCharges } from "./invoiceForm/useInvoiceQuoteCharges";
import { useInvoiceBookings } from "./invoices/useInvoiceBookings";
import { useInvoice } from "./invoices/useInvoices";
import { useExtensionPrefill } from "./useExtensionPrefill";

export type { InvoiceFormValues };

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
export function collectInvoicedBookingIds(
  invoices: { id?: string; status: string; booking_id?: string | null }[] | undefined,
  allInvoiceBookings: { invoice_id: string; booking_id: string }[] | undefined,
  currentInvoiceId?: string,
): Set<string> {
  const set = new Set<string>();
  invoices?.forEach((inv) => {
    if (currentInvoiceId && inv.id === currentInvoiceId) return;
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

function invoiceSchemaForEdit(isEdit: boolean, existing: ExistingInvoice | null | undefined) {
  return createInvoiceFormSchema(isEdit && existing ? buildFromInvoice(existing, undefined) : undefined);
}

/** Reservas confirmadas o completadas con periodo pendiente (+ extensión en curso).
 * La devolución cierra la operación, no la obligación de facturar la renta. */
type InvoiceBillingBooking = BookingWithForklift & Pick<BillableBooking, "pending_billing_period">;

function filterAvailableBookings(
  bookings: InvoiceBillingBooking[] | undefined,
  invoicedBookingIds: Set<string>,
  extensionBookingId: string | null,
): InvoiceBillingBooking[] | undefined {
  return bookings?.filter(
    (booking) =>
      (booking.status === "confirmed" || booking.status === "completed") &&
      (!invoicedBookingIds.has(booking.id) || booking.id === extensionBookingId),
  );
}

export function useInvoiceFormLogic({ id, fromQuoteId, extensionId = null }: UseInvoiceFormLogicArgs) {

  const isEdit = !!id;
  const quoteId = fromQuoteId || undefined;

  const bookingsQuery = useBookings();
  const { data: bookings } = bookingsQuery;
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: existing, isLoading: isLoadingExisting } = useInvoice(id);
  const { data: sourceQuote } = useQuote(quoteId);
  const { data: assignments } = useQuoteAssignments(quoteId);
  const invoiceBookingsQuery = useInvoiceBookings(id);
  const { data: invoiceBookingsRows } = invoiceBookingsQuery;
  const existingBookingIds = (invoiceBookingsRows ?? []).map((r) => r.booking_id);
  const periods = useInvoiceBookingPeriods({ bookings, forklifts, isEdit, id, extensionId, existing, existingBookingIds });

  const invoiceVersion = useInitialRecordVersion(id, existing?.id, existing?.version);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchemaForEdit(isEdit, existing)),
    defaultValues: buildEmptyInvoiceValues(),
  });

  const quoteAssignmentStatus = useQuoteSaleAssignmentStatus(
    quoteId,
    toQuoteLineItems(sourceQuote),
  );

  const saleAssignmentGuard = buildSaleAssignmentGuard(quoteAssignmentStatus, {
    isEdit,
    fromQuoteId,
    quoteType: sourceQuote?.quote_type,
  });

  // v7.381.1: carrera/estado obsoleto — el guard de BD rechazó el INSERT porque
  // la cotización de venta ya no está completamente asignada. La UI reusa el
  // bloqueo determinístico (SaleAssignmentBlocked) con este disparador.
  const [serverSaleAssignmentBlock, setServerSaleAssignmentBlock] = useState<BusinessBlock | null>(null);
  const submit = useInvoiceFormSubmit({
    onBusinessBlock: (block) => {
      if (block.code === "quote_sale_assignment_incomplete") setServerSaleAssignmentBlock(block);
    },
  });
  const uniqueBookingQuoteIds = collectBookingQuoteIds(bookings);
  const { data: bookingSourceQuotes } = useQuotesByIds(uniqueBookingQuoteIds);
  const { relatedQuoteIds, chargeAvailability, bookingSourceBlock, chargeAvailabilityError } = useInvoiceQuoteCharges({
    form, bookings, invoiceBookingsRows, existing, fromQuoteId, currentInvoiceId: id,
  });
  const { quoteChargePrefillError } = useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form, existingBookingIds,
    chargeAvailability: chargeAvailability.isError ? undefined : chargeAvailability.data });
  const { handleCustomerSelect, handleBookingSelect, handleBookingsChange, isLoadingCharges, chargeSelectionError, retryChargeSelection } = useInvoiceFormHandlers({
    form, customers, bookings: periods.handlerBookings, forklifts, quotes: bookingSourceQuotes,
    loadQuoteCharges: chargeAvailability.loadForQuotes,
  });
  const selectedBookingIds = useWatch({ control: form.control, name: "bookingIds" });
  const chargeBlock = invoiceChargeBlock(isLoadingCharges, periods.linkedBlock(selectedBookingIds),
    bookingSourceBlock, chargeSelectionError, chargeAvailabilityError, quoteChargePrefillError);

  const totals = useInvoiceFormTotals(form);



  // v7.307.0: al facturar una extensión, la reserva YA tiene factura del
  // período original. Se re-habilita para poder ligar la factura del tramo
  // extendido; el doble cobro lo evita el guard de `booking_extensions`.
  const { extension } = useExtensionPrefill({
    isEdit,
    extensionId,
    customersLoaded: Boolean(customers?.length),
    form,
    handleCustomerSelect,
  });
  const extensionBookingId = extension?.booking_id ?? null;

  const availableBookings = filterAvailableBookings(
    periods.candidates as BookingWithForklift[] | undefined,
    periods.unavailableIds,
    extensionBookingId,
  );

  const onSubmit = (values: InvoiceFormValues) => {
    const payload = submit.buildPayload({
      values, isEdit, fromQuoteId,
      existingBookingId: existing?.booking_id,
      existingQuoteId: existing?.quote_id,
    });
    // An unchanged historical fiscal snapshot must not be reserialized/recalculated.
    if (isEdit && existing && hasLegacyVat({ tax_rate: values.taxRate, line_items: values.lineItems })) {
      return { ...payload, line_items: existing.line_items, tax_rate: existing.tax_rate, subtotal: existing.subtotal, tax_amount: existing.tax_amount, total: existing.total };
    }
    return payload;
  };

  /**
   * Regresión v7.423.0 (P2/P3): validación al GUARDAR — no depende del filtro
   * visual del selector. Reglas: (a) las reservas seleccionadas deben ser
   * compatibles entre sí (cliente, moneda/TC, mismo periodo canónico) y
   * (b) el periodo capturado debe caber en el rango de TODAS. El servidor
   * re-valida lo mismo dentro del RPC transaccional (autoridad final).
   */
  const validateSelection = (
    values: InvoiceFormValues,
  ): { field: "bookingIds" | "billingPeriodStart" | "lineItems"; message: string } | null => {
    const chargeError = chargeBlock || quoteChargeSelectionError(relatedQuoteIds, values.lineItems, chargeAvailability.data);
    if (chargeError) return { field: "lineItems", message: chargeError };
    const selected = (values.bookingIds ?? [])
      .map((bid) => periods.billingBookings?.find((b) => b.id === bid))
      .filter(Boolean) as unknown as BillableBooking[];
    const periodError = bookingPeriodSelectionError(values.bookingIds ?? [], selected, periods.claims,
      values.billingPeriodStart, values.billingPeriodEnd, periods.linkedBlock(values.bookingIds), id);
    if (periodError) return periodError;
    const lateError = !isEdit && lateRecoverySelectionError(selected, values.lineItems);
    if (lateError) return { field: "lineItems", message: lateError };
    if (selected.length === 0) return null;
    if (!isEdit) {
      const quoted = (values.bookingIds ?? []).flatMap((bid) => periods.billingBookings?.find((booking) => booking.id === bid) ?? []);
      const pactError = quotedBillingPeriodError(quoted, bookingSourceQuotes, values.billingPeriodStart, values.billingPeriodEnd,
        { requestedId: extensionId, loaded: extension });
      if (pactError) return { field: "billingPeriodStart", message: pactError };
    }
    const issue = values.issueDate ?? nowMty();
    const mix = validateBookingSelection(selected, issue);
    if (mix) return { field: "bookingIds", message: mix };
    const range = periodOutsideBookingsError(
      selected,
      values.billingPeriodStart,
      values.billingPeriodEnd,
    );
    if (range) return { field: "billingPeriodStart", message: range };
    return null;
  };

  return {
    form, isEdit, id, fromQuoteId,
    existing,
    isLoadingInvoice: isLoadingExisting,
    invoiceNumber: existing?.invoice_number ?? null,
    // R4-25: versión al abrir el formulario, para bloqueo optimista al guardar.
    // (El snapshot interno `setInvoiceVersion` ya no se expone: con el RPC
    // transaccional un fallo revierte también el bump de versión, así que el
    // reintento usa el mismo expectedVersion sin falso stale_write.)
    invoiceVersion,
    customers, availableBookings,
    sourceQuote,
    saleAssignmentGuard,
    serverSaleAssignmentBlock,
    extension,
    handleCustomerSelect, handleBookingSelect, handleBookingsChange,
    onSubmit,
    validateSelection,
    chargeBlock,
    bookingAvailabilityBlock: periods.availabilityBlock,
    retryChargeAvailability: () => {
      if (periods.block || periods.invalidHistory) return Promise.all([bookingsQuery.refetch(), periods.refetch()]);
      if (bookingSourceBlock) return Promise.all([bookingsQuery.refetch(), invoiceBookingsQuery.refetch()]);
      return chargeSelectionError ? retryChargeSelection() : chargeAvailability.refetch();
    },
    isLoadingChargeAvailability: isLoadingCharges || chargeAvailability.isFetching || periods.isFetching,
    saveInvoice: submit.saveInvoice,
    updateQuote: submit.updateQuote,
    subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total,
    isPending: submit.isPending,
  };
}

