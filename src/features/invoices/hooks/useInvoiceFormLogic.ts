import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useBookings, type BookingWithForklift } from "@/features/bookings";
import { useForklifts, useQuoteAssignments } from "@/features/fleet";
import { useInvoice, useInvoices } from "./invoices/useInvoices";
import { useInvoiceBookings, useAllInvoiceBookings } from "./invoices/useInvoiceBookings";
import { useCustomers } from "@/features/customers";
import { useQuote, useQuoteSaleAssignmentStatus } from "@/features/quotes";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import {
  invoiceFormSchema,
  buildEmptyInvoiceValues,
  type InvoiceFormValues,
  type LineItemValues,
} from "../lib/invoiceFormSchema";
import { useInvoicePrefill } from "./invoiceForm/useInvoicePrefill";
import { useInvoiceFormHandlers } from "./invoiceForm/useInvoiceFormHandlers";
import { useInvoiceFormTotals } from "./invoiceForm/useInvoiceFormTotals";
import { useInvoiceFormSubmit } from "./invoiceForm/useInvoiceFormSubmit";

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
  const existingBookingIds = useMemo(
    () => (invoiceBookingsRows ?? []).map((r) => r.booking_id),
    [invoiceBookingsRows],
  );

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: buildEmptyInvoiceValues(),
  });

  useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form, existingBookingIds });

  const quoteLineItems = useMemo<LineItem[]>(
    () => (Array.isArray(sourceQuote?.line_items) ? (sourceQuote?.line_items as unknown as LineItem[]) : []),
    [sourceQuote],
  );
  const quoteAssignmentStatus = useQuoteSaleAssignmentStatus(fromQuoteId || undefined, quoteLineItems);

  const saleAssignmentGuard: SaleAssignmentGuard = useMemo(() => {
    const shouldBlock =
      !isEdit &&
      !!sourceQuote &&
      !!fromQuoteId &&
      sourceQuote.quote_type === "sale" &&
      !quoteAssignmentStatus.isComplete;
    return {
      shouldBlock,
      totalAssigned: quoteAssignmentStatus.totalAssigned,
      totalRequired: quoteAssignmentStatus.totalRequired,
      missingByLine: quoteAssignmentStatus.missingByLine,
    };
  }, [isEdit, sourceQuote, fromQuoteId, quoteAssignmentStatus]);

  const submit = useInvoiceFormSubmit();
  const { handleCustomerSelect, handleBookingSelect, handleBookingsChange } = useInvoiceFormHandlers({ form, customers, bookings, forklifts });
  const totals = useInvoiceFormTotals(form);

  const invoicedBookingIds = useMemo(() => {
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
  }, [invoices, allInvoiceBookings, isEdit, id]);

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
