import { useState } from "react";
import { useForm } from "react-hook-form";
import type { BookingWithForklift } from "@/features/bookings";
import { useCustomers } from "@/features/customers";
import { useQuoteAssignments } from "@/features/fleet";
import { useQuote, useQuoteSaleAssignmentStatus, useQuotesByIds } from "@/features/quotes";
import { useInitialRecordVersion } from "@/hooks/useInitialRecordVersion";
import { zodResolver } from "@/lib/forms/zodResolver";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { notifyWarning } from "@/lib/ui/appFeedback";
import { buildEmptyInvoiceValues, type InvoiceFormValues } from "../lib/invoiceFormSchema";
import {
  applyLegacyVatSnapshotIfUnchanged,
  buildSaleAssignmentGuard,
  collectBookingQuoteIds,
  invoiceSchemaForEdit,
  toQuoteLineItems,
  validateInvoiceSelection,
} from "./invoiceForm/invoiceSelectionValidation";
import { buildInvoiceAvailabilityControls } from "./invoiceForm/useInvoiceAvailabilityRetry";
import { useInvoiceBookingPeriods } from "./invoiceForm/useInvoiceBookingPeriods";
import {
  candidateAvailabilityBlock,
  filterAvailableBookings,
  includeSelectedBookings,
  useBillingEquipment,
  useInvoiceBookingPicker,
  withEvidenceLoading,
} from "./invoiceForm/useInvoiceBookingPicker";
import { useInvoiceFormHandlers } from "./invoiceForm/useInvoiceFormHandlers";
import { useInvoiceFormSubmit } from "./invoiceForm/useInvoiceFormSubmit";
import { invoiceChargeBlock, useInvoiceQuoteCharges } from "./invoiceForm/useInvoiceQuoteCharges";
import { useInvoiceQuoteSource } from "./invoiceForm/useInvoiceQuoteSource";
import { useInvoiceSourceCustomer } from "./invoiceForm/useInvoiceSourceCustomer";
import { useExtensionPrefill } from "./useExtensionPrefill";
import { useInvoiceBookings } from "./useInvoiceBookings";
import { useInvoice } from "./useInvoices";

export type { InvoiceFormValues };

interface UseInvoiceFormLogicArgs {
  id?: string;
  fromQuoteId: string | null;
  /** v7.307.0: id de `booking_extensions` cuando venimos de "Facturar extensión". */
  extensionId?: string | null;
  damageId?: string | null;
}

function handleInvoiceBusinessBlock(
  block: BusinessBlock,
  onSaleAssignmentBlock: (block: BusinessBlock) => void,
) {
  if (block.code === "quote_sale_assignment_incomplete") {
    onSaleAssignmentBlock(block);
  } else {
    notifyWarning(block.action, { description: `${block.reason} ${block.nextStep}` });
  }
}

export function useInvoiceFormLogic({
  id,
  fromQuoteId,
  extensionId = null,
  damageId = null,
}: UseInvoiceFormLogicArgs) {
  const isEdit = !!id;
  const quoteId = fromQuoteId || undefined;

  const customerListQuery = useCustomers();
  const { data: existing, isLoading: isLoadingExisting, ...invoiceRead } = useInvoice(id);
  const quoteQuery = useQuote(quoteId);
  const { data: sourceQuote } = quoteQuery;
  const sourceCustomer = useInvoiceSourceCustomer({
    isEdit, quoteId, quote: sourceQuote, extensionId, damageId, customers: customerListQuery.data,
  });
  const assignmentsQuery = useQuoteAssignments(quoteId);
  const { data: assignments } = assignmentsQuery;
  const invoiceBookingsQuery = useInvoiceBookings(id);
  const { data: invoiceBookingsRows } = invoiceBookingsQuery;
  const existingBookingIds = (invoiceBookingsRows ?? []).map((r) => r.booking_id);
  const form = useForm<InvoiceFormValues>({
    shouldFocusError: false,
    resolver: zodResolver(invoiceSchemaForEdit(isEdit, existing)),
    defaultValues: buildEmptyInvoiceValues(),
  });
  const { selectedBookingIds, bookingsQuery, bookingPicker } = useInvoiceBookingPicker(
    form.control, existingBookingIds, isEdit, existing,
  );
  const { data: bookings } = bookingsQuery;
  const equipment = useBillingEquipment(assignments, bookings);
  const forklifts = equipment.data;
  const candidatesBlock = candidateAvailabilityBlock(bookingsQuery);
  const periods = useInvoiceBookingPeriods({
    bookings, forklifts, isEdit, id, extensionId, existing, existingBookingIds,
  });
  const invoiceVersion = useInitialRecordVersion(id, existing?.id, existing?.version);
  const quoteAssignmentStatus = useQuoteSaleAssignmentStatus(quoteId, toQuoteLineItems(sourceQuote));
  const saleAssignmentGuard = buildSaleAssignmentGuard(quoteAssignmentStatus, {
    isEdit, fromQuoteId, quoteType: sourceQuote?.quote_type,
  });

  // v7.381.1: carrera/estado obsoleto — el guard de BD rechazó el INSERT porque
  // la cotización de venta ya no está completamente asignada.
  const [serverSaleAssignmentBlock, setServerSaleAssignmentBlock] = useState<BusinessBlock | null>(null);
  const submit = useInvoiceFormSubmit({
    onBusinessBlock: (block) => handleInvoiceBusinessBlock(block, setServerSaleAssignmentBlock),
  });
  const selectedIds = new Set(selectedBookingIds);
  const bookingQuoteSources = useQuotesByIds(
    collectBookingQuoteIds(bookings?.filter((booking) => selectedIds.has(booking.id))),
  );
  const { data: bookingSourceQuotes } = bookingQuoteSources;
  const { relatedQuoteIds, chargeAvailability, bookingSourceBlock, chargeAvailabilityError } =
    useInvoiceQuoteCharges({ form, bookings, invoiceBookingsRows, existing, fromQuoteId, currentInvoiceId: id });
  const quotePrefill = useInvoiceQuoteSource(
    { existing, sourceQuote, assignments, forklifts, customers: sourceCustomer.prefillCustomers, isEdit, form, existingBookingIds, requestedQuoteId: fromQuoteId },
    { extensionId, damageId },
    chargeAvailability,
    [quoteQuery, assignmentsQuery, { isError: equipment.isError, refetch: equipment.retry }, ...sourceCustomer.dependencies],
  );
  const { handleCustomerSelect, handleBookingSelect, handleBookingsChange, isLoadingCharges, chargeSelectionError, retryChargeSelection } =
    useInvoiceFormHandlers({
      form, customers: customerListQuery.data, bookings: periods.handlerBookings, loadEquipment: equipment.loadForIds,
      quotes: bookingSourceQuotes, loadQuoteSources: bookingQuoteSources.loadForIds, loadQuotedBookings: bookingsQuery.loadQuotedBookings,
      loadQuoteCharges: chargeAvailability.loadForQuotes, loadCustomer: sourceCustomer.loadForId,
    });
  const { extension, prefillBlock, isLoadingPrefill, retryPrefill, interruptPrefill } = useExtensionPrefill({
    isEdit, extensionId, form, handleCustomerSelect,
  });
  const chargeBlock = invoiceChargeBlock(
    isLoadingCharges, periods.linkedBlock(selectedBookingIds),
    bookingSourceBlock, chargeSelectionError, chargeAvailabilityError, quotePrefill.block, prefillBlock ?? null,
  );
  const availableBookings = filterAvailableBookings(
    periods.candidates as BookingWithForklift[] | undefined, periods.unavailableIds, extension?.booking_id ?? null,
  );
  const pickerBookings = includeSelectedBookings(availableBookings, bookings, selectedIds);
  const onSubmit = (values: InvoiceFormValues) => applyLegacyVatSnapshotIfUnchanged(
    submit.buildPayload({ values, isEdit, fromQuoteId, existingBookingId: existing?.booking_id, existingQuoteId: existing?.quote_id }),
    values, isEdit, existing,
  );
  const validateSelection = (values: InvoiceFormValues) => validateInvoiceSelection(values, {
    isEdit, id, extensionId, extension, candidatesBlock, chargeBlock,
    relatedQuoteIds, chargeAvailabilityData: chargeAvailability.data, periods, bookingSourceQuotes,
  });
  const availabilityControls = buildInvoiceAvailabilityControls({
    candidatesBlock, periods, prefillBlock, isLoadingPrefill, retryPrefill, quotePrefill, equipment,
    bookingSourceBlock, chargeSelectionError, isLoadingCharges, retryChargeSelection, chargeAvailability,
    bookingsQuery, invoiceBookingsQuery, quoteQuery, assignmentsQuery, sourceCustomer,
  });

  return {
    form, isEdit, id, fromQuoteId, existing, invoiceRead,
    isLoadingInvoice: isLoadingExisting, invoiceNumber: existing?.invoice_number ?? null, invoiceVersion,
    customers: customerListQuery.data, customerListQuery, availableBookings, pickerBookings,
    bookingPicker: withEvidenceLoading(bookingPicker, periods),
    sourceQuote, sourceQuoteVersion: quotePrefill.sourceQuoteVersion, saleAssignmentGuard, serverSaleAssignmentBlock, extension,
    handleCustomerSelect: (...args: Parameters<typeof handleCustomerSelect>) => { interruptPrefill(); handleCustomerSelect(...args); },
    handleBookingSelect: (bookingId: string) => { interruptPrefill(); handleBookingSelect(bookingId); },
    handleBookingsChange: (bookingIds: string[]) => { interruptPrefill(); return handleBookingsChange(bookingIds); },
    onSubmit, validateSelection, chargeBlock, ...availabilityControls,
    saveInvoice: submit.saveInvoice, isPending: submit.isPending,
  };
}
