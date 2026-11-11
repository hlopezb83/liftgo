
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { BookingWithForklift } from "@/features/bookings";
import { useCustomers } from "@/features/customers";
import { useQuoteAssignments } from "@/features/fleet";
import { useQuote, useQuoteSaleAssignmentStatus, useQuotesByIds } from "@/features/quotes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useInitialRecordVersion } from "@/hooks/useInitialRecordVersion";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { hasLegacyVat } from "@/lib/fiscal/legacyVat";
import { zodResolver } from "@/lib/forms/zodResolver";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { notifyWarning } from "@/lib/ui/appFeedback";
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
import { invoiceChargeBlock, useInvoiceQuoteCharges } from "./invoiceForm/useInvoiceQuoteCharges";
import { useInvoiceQuoteSource } from "./invoiceForm/useInvoiceQuoteSource";
import { useInvoiceRentalEquipment } from "./invoiceForm/useInvoiceRentalEquipment";
import { useInvoiceBookingCandidates } from "./invoices/useInvoiceBookingCandidates";
import { useInvoiceBookings } from "./invoices/useInvoiceBookings";
import { useInvoice } from "./invoices/useInvoices";
import { useExtensionPrefill } from "./useExtensionPrefill";
import type { Control } from "react-hook-form";

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
  damageId?: string | null;
}

/** Ids únicos de cotización referenciados por las reservas. */
function collectBookingQuoteIds(bookings?: { quote_id?: string | null }[]): string[] {
  const set = new Set<string>();
  bookings?.forEach((b) => {
    if (b.quote_id) set.add(b.quote_id);
  });
  return Array.from(set);
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

function linkedCandidateIds(ids: string[], existing?: ExistingInvoice | null) {
  return existing?.booking_id ? [...ids, existing.booking_id] : ids;
}

function candidateAvailabilityBlock(query: { isError: boolean; isSuccess: boolean }) {
  if (query.isError) return "No se pudieron consultar las reservas facturables. Reintenta la consulta.";
  return query.isSuccess ? null : "Espera a que carguen las reservas facturables.";
}

function selectedCandidateBlock(ids: string[] | undefined, block: string | null) {
  return ids?.length ? block : null;
}

function selectedBillingBookings(ids: string[] | undefined, bookings: BillableBooking[] | undefined): BillableBooking[] {
  return (ids ?? []).flatMap((id) => bookings?.find((booking) => booking.id === id) ?? []);
}

function useBookingPicker(control: Control<InvoiceFormValues>, ids: string[], isEdit: boolean, existing?: ExistingInvoice | null) {
  const [selectedBookingIds, customerId] = useWatch({ control, name: ["bookingIds", "customerId"] });
  const [picker, setPicker] = useState({ search: "", page: 0, customerId: "" });
  const page = picker.customerId === customerId ? picker.page : 0;
  const search = useDebouncedValue(picker.search);
  const linkedIds = linkedCandidateIds([...ids, ...(selectedBookingIds ?? [])], existing);
  const bookingsQuery = useInvoiceBookingCandidates(linkedIds, {
    search, page, customerId: selectedBookingIds?.length ? customerId || null : null, linkedOnly: isEdit,
  });
  const bookingPicker = {
    search: picker.search, page, hasMore: bookingsQuery.hasMore,
    isLoading: picker.search !== search || bookingsQuery.isPending || !!bookingsQuery.isPlaceholderData,
    isError: bookingsQuery.isError, onRetry: () => { void bookingsQuery.refetch(); },
    onSearchChange: (value: string) => setPicker({ search: value, page: 0, customerId }),
    onPageChange: (next: number) => setPicker({ search: picker.search, page: next, customerId }),
  };
  return { selectedBookingIds, bookingsQuery, bookingPicker };
}

function includeSelectedBookings(available: InvoiceBillingBooking[] | undefined, bookings: BookingWithForklift[] | undefined, selected: Set<string>) {
  const visible = new Set(available?.map((booking) => booking.id));
  // Keep a removable chip while a refresh marks a selected row unavailable.
  return [...(available ?? []), ...(bookings ?? []).filter((booking) => selected.has(booking.id) && !visible.has(booking.id))];
}

function withEvidenceLoading(picker: ReturnType<typeof useBookingPicker>["bookingPicker"], periods: { isFetching: boolean; ready: boolean }) {
  return { ...picker, isLoading: picker.isLoading || (periods.isFetching && !periods.ready) };
}

function recurringEquipmentIds(bookings: BookingWithForklift[] | undefined) {
  return (bookings ?? []).filter((booking) => booking.status === "completed" && booking.recurring_billing && booking.monthly_rate == null)
    .map((booking) => booking.forklift_id);
}

function useBillingEquipment(assignments: ReturnType<typeof useQuoteAssignments>["data"], bookings: BookingWithForklift[] | undefined) {
  const ids = [...(assignments ?? []).map((assignment) => assignment.forklift_id), ...recurringEquipmentIds(bookings)];
  const equipment = useInvoiceRentalEquipment(ids);
  return { ...equipment, retry: () => ids.length ? equipment.refetch() : Promise.resolve() };
}

export function useInvoiceFormLogic({ id, fromQuoteId, extensionId = null, damageId = null }: UseInvoiceFormLogicArgs) {

  const isEdit = !!id;
  const quoteId = fromQuoteId || undefined;

  const { data: customers } = useCustomers();
  const { data: existing, isLoading: isLoadingExisting } = useInvoice(id);
  const quoteQuery = useQuote(quoteId);
  const { data: sourceQuote } = quoteQuery;
  const assignmentsQuery = useQuoteAssignments(quoteId);
  const { data: assignments } = assignmentsQuery;
  const invoiceBookingsQuery = useInvoiceBookings(id);
  const { data: invoiceBookingsRows } = invoiceBookingsQuery;
  const existingBookingIds = (invoiceBookingsRows ?? []).map((r) => r.booking_id);
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchemaForEdit(isEdit, existing)),
    defaultValues: buildEmptyInvoiceValues(),
  });
  const { selectedBookingIds, bookingsQuery, bookingPicker } = useBookingPicker(form.control, existingBookingIds, isEdit, existing);
  const { data: bookings } = bookingsQuery;
  const equipment = useBillingEquipment(assignments, bookings);
  const forklifts = equipment.data;
  const candidatesBlock = candidateAvailabilityBlock(bookingsQuery);
  const periods = useInvoiceBookingPeriods({ bookings, forklifts, isEdit, id, extensionId, existing, existingBookingIds });
  const invoiceVersion = useInitialRecordVersion(id, existing?.id, existing?.version);

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
      if (block.code === "quote_sale_assignment_incomplete") {
        setServerSaleAssignmentBlock(block);
      } else {
        notifyWarning(block.action, { description: `${block.reason} ${block.nextStep}` });
      }
    },
  });
  const selectedIds = new Set(selectedBookingIds);
  const bookingQuoteSources = useQuotesByIds(collectBookingQuoteIds(bookings?.filter((booking) => selectedIds.has(booking.id))));
  const { data: bookingSourceQuotes } = bookingQuoteSources;
  const { relatedQuoteIds, chargeAvailability, bookingSourceBlock, chargeAvailabilityError } = useInvoiceQuoteCharges({
    form, bookings, invoiceBookingsRows, existing, fromQuoteId, currentInvoiceId: id,
  });
  const quotePrefill = useInvoiceQuoteSource({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form,
    existingBookingIds, requestedQuoteId: fromQuoteId }, { extensionId, damageId }, chargeAvailability,
    [quoteQuery, assignmentsQuery, { isError: equipment.isError, refetch: equipment.retry }]);
  const { handleCustomerSelect, handleBookingSelect, handleBookingsChange, isLoadingCharges, chargeSelectionError, retryChargeSelection } = useInvoiceFormHandlers({
    form, customers, bookings: periods.handlerBookings, loadEquipment: equipment.loadForIds, quotes: bookingSourceQuotes,
    loadQuoteSources: bookingQuoteSources.loadForIds, loadQuotedBookings: bookingsQuery.loadQuotedBookings,
    loadQuoteCharges: chargeAvailability.loadForQuotes,
  });




  // v7.307.0: al facturar una extensión, la reserva YA tiene factura del
  // período original. Se re-habilita para poder ligar la factura del tramo
  // extendido; el doble cobro lo evita el guard de `booking_extensions`.
  const { extension, prefillBlock, isLoadingPrefill, retryPrefill, interruptPrefill } = useExtensionPrefill({
    isEdit,
    extensionId,
    form,
    handleCustomerSelect,
  });
  const extensionBookingId = extension?.booking_id ?? null;
  const chargeBlock = invoiceChargeBlock(isLoadingCharges, periods.linkedBlock(selectedBookingIds),
    bookingSourceBlock, chargeSelectionError, chargeAvailabilityError, quotePrefill.block, prefillBlock ?? null);

  const availableBookings = filterAvailableBookings(
    periods.candidates as BookingWithForklift[] | undefined,
    periods.unavailableIds,
    extensionBookingId,
  );
  const pickerBookings = includeSelectedBookings(availableBookings, bookings, selectedIds);

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
    const candidateError = selectedCandidateBlock(values.bookingIds, candidatesBlock);
    if (candidateError) return { field: "bookingIds", message: candidateError };
    const chargeError = chargeBlock || quoteChargeSelectionError(relatedQuoteIds, values.lineItems, chargeAvailability.data);
    if (chargeError) return { field: "lineItems", message: chargeError };
    const selected = selectedBillingBookings(values.bookingIds, periods.billingBookings);
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
    customers, availableBookings, pickerBookings,
    bookingPicker: withEvidenceLoading(bookingPicker, periods),
    sourceQuote,
    sourceQuoteVersion: quotePrefill.sourceQuoteVersion,
    saleAssignmentGuard,
    serverSaleAssignmentBlock,
    extension,
    handleCustomerSelect: (...args: Parameters<typeof handleCustomerSelect>) => { interruptPrefill(); handleCustomerSelect(...args); },
    handleBookingSelect: (bookingId: string) => { interruptPrefill(); handleBookingSelect(bookingId); },
    handleBookingsChange: (bookingIds: string[]) => { interruptPrefill(); return handleBookingsChange(bookingIds); },
    onSubmit,
    validateSelection,
    chargeBlock,
    bookingAvailabilityBlock: [candidatesBlock, periods.availabilityBlock].find(Boolean) ?? null,
    retryChargeAvailability: () => {
      if (prefillBlock) return retryPrefill();
      if (quotePrefill.block) return quotePrefill.retry();
      if (equipment.isError) return equipment.refetch();
      if ([candidatesBlock, periods.block, periods.invalidHistory].some(Boolean)) return Promise.all([bookingsQuery.refetch(), periods.refetch()]);
      if (bookingSourceBlock) return Promise.all([bookingsQuery.refetch(), invoiceBookingsQuery.refetch()]);
      return chargeSelectionError ? retryChargeSelection() : chargeAvailability.refetch();
    },
    isLoadingChargeAvailability: [bookingsQuery.isFetching, isLoadingCharges, chargeAvailability.isFetching,
      periods.isFetching, isLoadingPrefill, equipment.isFetching, quoteQuery.isFetching, assignmentsQuery.isFetching].some(Boolean),
    saveInvoice: submit.saveInvoice,
    isPending: submit.isPending,
  };
}

