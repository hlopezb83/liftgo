
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
}

export function useInvoiceFormLogic({ id, fromQuoteId }: UseInvoiceFormLogicArgs) {
  const isEdit = !!id;

  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: existing } = useInvoice(id);
  const { data: sourceQuote } = useQuote(fromQuoteId || undefined);
  const { data: assignments } = useQuoteAssignments(fromQuoteId || undefined);
  const { data: invoices } = useInvoices();
  const { data: allInvoiceBookings } = useAllInvoiceBookings();
  const { data: invoiceBookingsRows } = useInvoiceBookings(id);
  const existingBookingIds = (invoiceBookingsRows ?? []).map((r) => r.booking_id);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: buildEmptyInvoiceValues(),
  });

  useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form, existingBookingIds });

  const quoteLineItems: LineItem[] = Array.isArray(sourceQuote?.line_items)
    ? (sourceQuote?.line_items as unknown as LineItem[])
    : [];
  const quoteAssignmentStatus = useQuoteSaleAssignmentStatus(fromQuoteId || undefined, quoteLineItems);

  const saleAssignmentGuard: SaleAssignmentGuard = {
    shouldBlock:
      !isEdit &&
      !!sourceQuote &&
      !!fromQuoteId &&
      sourceQuote.quote_type === "sale" &&
      !quoteAssignmentStatus.isComplete,
    totalAssigned: quoteAssignmentStatus.totalAssigned,
    totalRequired: quoteAssignmentStatus.totalRequired,
    missingByLine: quoteAssignmentStatus.missingByLine,
  };

  const submit = useInvoiceFormSubmit();
  const uniqueBookingQuoteIds = (() => {
    const set = new Set<string>();
    bookings?.forEach((b) => { if (b.quote_id) set.add(b.quote_id); });
    return Array.from(set);
  })();
  const { data: bookingSourceQuotes } = useQuotesByIds(uniqueBookingQuoteIds);
  const { handleCustomerSelect, handleBookingSelect, handleBookingsChange } = useInvoiceFormHandlers({ form, customers, bookings, forklifts, quotes: bookingSourceQuotes });
  const totals = useInvoiceFormTotals(form);

  const invoicedBookingIds = (() => {
    const set = new Set<string>();
    invoices?.forEach((inv) => {
      if (inv.status !== "cancelled" && inv.booking_id) set.add(inv.booking_id);
    });
    // Reservas vinculadas vía pivote (excluyendo las de la factura que se está editando).
    allInvoiceBookings?.forEach((row) => {
      if (isEdit && row.invoice_id === id) return;
      set.add(row.booking_id);
    });
    return set;
  })();

  const availableBookings = bookings?.filter(
    (booking) => booking.status === "confirmed" && !invoicedBookingIds.has(booking.id),
  ) as BookingWithForklift[] | undefined;

  const onSubmit = (values: InvoiceFormValues) => submit.buildPayload({
    values, isEdit, fromQuoteId,
    existingBookingId: existing?.booking_id,
    existingQuoteId: existing?.quote_id,
  });

  return {
    form, isEdit, id, fromQuoteId,
    customers, availableBookings,
    sourceQuote,
    saleAssignmentGuard,
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
